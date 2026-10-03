// Aurora's half of the ScreenCast restore-token handshake, against a fake
// org.freedesktop.portal.Desktop on a private session bus (a dbus-daemon child
// process; not GTestDBus, whose teardown waits 30s for the process-wide bus
// connection XdgDesktopPortal never releases). No
// compositor, PipeWire or real portal: this pins what Aurora *sends* and
// *stores*, not whether a given backend honors persist_mode -- that stays a
// manual check per desktop (Aurora-3ddb).
#include <catch2/catch_test_macros.hpp>

#include <fcntl.h>
#include <unistd.h>

#include <chrono>
#include <future>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <gio/gio.h>
#include <gio/gunixfdlist.h>

#include <Aurora/Input/Linux/IRestoreTokenStore.hpp>
#include <Aurora/Input/Linux/XdgDesktopPortal.hpp>

using namespace Aurora::Input::Linux;

namespace
{
  const char* kInterfaceXml = R"(
    <node>
      <interface name='org.freedesktop.portal.ScreenCast'>
        <method name='CreateSession'>
          <arg type='a{sv}' name='options' direction='in'/>
          <arg type='o' name='handle' direction='out'/>
        </method>
        <method name='SelectSources'>
          <arg type='o' name='session_handle' direction='in'/>
          <arg type='a{sv}' name='options' direction='in'/>
          <arg type='o' name='handle' direction='out'/>
        </method>
        <method name='Start'>
          <arg type='o' name='session_handle' direction='in'/>
          <arg type='s' name='parent_window' direction='in'/>
          <arg type='a{sv}' name='options' direction='in'/>
          <arg type='o' name='handle' direction='out'/>
        </method>
        <method name='OpenPipeWireRemote'>
          <arg type='o' name='session_handle' direction='in'/>
          <arg type='a{sv}' name='options' direction='in'/>
          <arg type='h' name='fd' direction='out'/>
        </method>
        <property type='u' name='AvailableSourceTypes' access='read'/>
        <property type='u' name='AvailableCursorModes' access='read'/>
        <property type='u' name='version' access='read'/>
      </interface>
    </node>
  )";


  struct SelectSourcesOptions
  {
    std::optional<uint32_t> persistMode;
    std::optional<std::string> restoreToken;
  };


  // Counts writes so "unchanged token is not rewritten" is observable.
  class RecordingStore : public IRestoreTokenStore
  {
  public:
    std::optional<std::string> restoreToken() const override { return m_token; }
    void setRestoreToken(const std::string& token) override { m_token = token; ++writes; }

    int writes{0};

  private:
    std::optional<std::string> m_token;
  };


  // Request/session object paths follow the portal convention: the caller's
  // unique name with ':' dropped and '.' -> '_', then the caller's token.
  std::string requestPath(const char* sender, const std::string& token)
  {
    std::string escaped(sender + 1);
    for(auto& c : escaped){ if(c == '.') c = '_'; }
    return "/org/freedesktop/portal/desktop/request/" + escaped + "/" + token;
  }


  class FakePortal
  {
  public:
    FakePortal()
    {
      _startBus();

      std::promise<void> ready;
      auto readyFuture = ready.get_future();
      m_thread = std::thread([this, &ready]{ _run(ready); });
      try{
        readyFuture.get();
      }
      catch(...){
        m_thread.join();
        _stopBus();
        throw;
      }
    }

    ~FakePortal()
    {
      g_main_loop_quit(m_loop);
      m_thread.join();
      _stopBus();
    }

    // What the next Start() hands back as restore_token (single use).
    void setNextStartToken(const std::string& token)
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      m_nextToken = token;
    }

    std::vector<SelectSourcesOptions> selectSourcesCalls()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_selectCalls;
    }

  private:
    void _startBus()
    {
      g_autoptr(GError) error = NULL;
      m_bus = g_subprocess_new(
        G_SUBPROCESS_FLAGS_STDOUT_PIPE, &error,
        "dbus-daemon", "--session", "--nofork", "--print-address=1", NULL
      );
      if(!m_bus){ throw std::runtime_error(std::string("FakePortal: ") + error->message); }

      // The daemon prints its listen address as its first line.
      g_autoptr(GDataInputStream) out = g_data_input_stream_new(g_subprocess_get_stdout_pipe(m_bus));
      g_autofree char* address = g_data_input_stream_read_line(out, NULL, NULL, &error);
      if(!address){
        _stopBus();
        throw std::runtime_error("FakePortal: dbus-daemon printed no address");
      }
      g_setenv("DBUS_SESSION_BUS_ADDRESS", address, TRUE);
    }

    void _stopBus()
    {
      g_subprocess_force_exit(m_bus);
      g_subprocess_wait(m_bus, NULL, NULL);
      g_object_unref(m_bus);
      m_bus = nullptr;
    }

    static void _onMethod(
      GDBusConnection*, const char* sender, const char*, const char*,
      const char* method, GVariant* params, GDBusMethodInvocation* invocation, void* data
    )
    {
      static_cast<FakePortal*>(data)->_handle(sender, method, params, invocation);
    }

    static GVariant* _onGetProperty(
      GDBusConnection*, const char*, const char*, const char*,
      const char* property, GError**, void*
    )
    {
      const std::string name = property;
      if(name == "version") return g_variant_new_uint32(4);
      if(name == "AvailableCursorModes") return g_variant_new_uint32(7);
      return g_variant_new_uint32(1);
    }

    // Unicast to the caller, as real portals do: Aurora subscribes with
    // NO_MATCH_RULE, so a broadcast would never reach it.
    void _respond(const char* sender, const std::string& path, GVariant* results)
    {
      g_dbus_connection_emit_signal(
        m_connection, sender, path.c_str(), "org.freedesktop.portal.Request", "Response",
        g_variant_new("(u@a{sv})", 0u, results), NULL
      );
    }

    static std::string _handleToken(GVariant* options)
    {
      const char* token = nullptr;
      g_variant_lookup(options, "handle_token", "&s", &token);
      return token ? token : "";
    }

    void _handle(const char* sender, const std::string& method, GVariant* params, GDBusMethodInvocation* invocation)
    {
      if(method == "CreateSession"){
        g_autoptr(GVariant) options = g_variant_get_child_value(params, 0);
        const std::string request = requestPath(sender, _handleToken(options));
        const char* sessionToken = nullptr;
        g_variant_lookup(options, "session_handle_token", "&s", &sessionToken);
        std::string escaped(sender + 1);
        for(auto& c : escaped){ if(c == '.') c = '_'; }
        const std::string session = "/org/freedesktop/portal/desktop/session/" + escaped + "/" + (sessionToken ? sessionToken : "s");

        g_dbus_method_invocation_return_value(invocation, g_variant_new("(o)", request.c_str()));
        GVariantBuilder results;
        g_variant_builder_init(&results, G_VARIANT_TYPE_VARDICT);
        g_variant_builder_add(&results, "{sv}", "session_handle", g_variant_new_string(session.c_str()));
        _respond(sender, request, g_variant_builder_end(&results));
      }
      else if(method == "SelectSources"){
        g_autoptr(GVariant) options = g_variant_get_child_value(params, 1);
        SelectSourcesOptions recorded;
        uint32_t persist = 0;
        if(g_variant_lookup(options, "persist_mode", "u", &persist)) recorded.persistMode = persist;
        const char* token = nullptr;
        if(g_variant_lookup(options, "restore_token", "&s", &token)) recorded.restoreToken = token;
        {
          std::lock_guard<std::mutex> lock(m_mutex);
          m_selectCalls.push_back(recorded);
        }

        const std::string request = requestPath(sender, _handleToken(options));
        g_dbus_method_invocation_return_value(invocation, g_variant_new("(o)", request.c_str()));
        GVariantBuilder results;
        g_variant_builder_init(&results, G_VARIANT_TYPE_VARDICT);
        _respond(sender, request, g_variant_builder_end(&results));
      }
      else if(method == "Start"){
        g_autoptr(GVariant) options = g_variant_get_child_value(params, 2);
        const std::string request = requestPath(sender, _handleToken(options));
        std::string token;
        {
          std::lock_guard<std::mutex> lock(m_mutex);
          token = m_nextToken;
        }

        g_dbus_method_invocation_return_value(invocation, g_variant_new("(o)", request.c_str()));
        GVariantBuilder results;
        g_variant_builder_init(&results, G_VARIANT_TYPE_VARDICT);
        g_variant_builder_add(&results, "{sv}", "streams", g_variant_new_parsed("[(uint32 42, @a{sv} {})]"));
        if(!token.empty()){
          g_variant_builder_add(&results, "{sv}", "restore_token", g_variant_new_string(token.c_str()));
        }
        _respond(sender, request, g_variant_builder_end(&results));
      }
      else if(method == "OpenPipeWireRemote"){
        // A real fd so the client's g_unix_fd_list_get succeeds; the test
        // never reads from it.
        g_autoptr(GUnixFDList) fds = g_unix_fd_list_new();
        const int fd = open("/dev/null", O_RDONLY | O_CLOEXEC);
        g_unix_fd_list_append(fds, fd, NULL);
        close(fd);
        g_dbus_method_invocation_return_value_with_unix_fd_list(invocation, g_variant_new("(h)", 0), fds);
      }
      else{
        g_dbus_method_invocation_return_dbus_error(invocation, "org.freedesktop.DBus.Error.UnknownMethod", method.c_str());
      }
    }

    // Catch2 assertions are not thread-safe here, so setup failures travel
    // back through the promise and surface in the constructor.
    void _run(std::promise<void>& ready)
    {
      auto fail = [&ready](const std::string& what){
        ready.set_exception(std::make_exception_ptr(std::runtime_error("FakePortal: " + what)));
      };

      m_context = g_main_context_new();
      g_main_context_push_thread_default(m_context);

      // Own connection (own unique name), not the shared g_bus_get one the
      // code under test uses.
      g_autoptr(GError) error = NULL;
      m_connection = g_dbus_connection_new_for_address_sync(
        g_getenv("DBUS_SESSION_BUS_ADDRESS"),
        static_cast<GDBusConnectionFlags>(
          G_DBUS_CONNECTION_FLAGS_AUTHENTICATION_CLIENT | G_DBUS_CONNECTION_FLAGS_MESSAGE_BUS_CONNECTION
        ),
        NULL, NULL, &error
      );
      if(!m_connection){ return fail(error ? error->message : "no connection"); }

      g_autoptr(GDBusNodeInfo) info = g_dbus_node_info_new_for_xml(kInterfaceXml, &error);
      if(!info){ return fail("bad introspection xml"); }
      static const GDBusInterfaceVTable vtable = {_onMethod, _onGetProperty, NULL, {}};
      g_dbus_connection_register_object(
        m_connection, "/org/freedesktop/portal/desktop", info->interfaces[0], &vtable, this, NULL, &error
      );
      if(error){ return fail(error->message); }

      g_autoptr(GVariant) owned = g_dbus_connection_call_sync(
        m_connection, "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "RequestName",
        g_variant_new("(su)", "org.freedesktop.portal.Desktop", 0u), NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL, &error
      );
      if(!owned){ return fail(error ? error->message : "RequestName failed"); }

      m_loop = g_main_loop_new(m_context, FALSE);
      ready.set_value();
      g_main_loop_run(m_loop);

      g_main_loop_unref(m_loop);
      g_object_unref(m_connection);
      g_main_context_pop_thread_default(m_context);
      g_main_context_unref(m_context);
    }

    GSubprocess* m_bus{nullptr};
    std::thread m_thread;
    GMainContext* m_context{nullptr};
    GMainLoop* m_loop{nullptr};
    GDBusConnection* m_connection{nullptr};

    std::mutex m_mutex;
    std::string m_nextToken;
    std::vector<SelectSourcesOptions> m_selectCalls;
  };


  // XdgDesktopPortal keeps one process-wide bus connection and proxy, so the
  // fake lives for the whole process and every case below shares it.
  FakePortal& fakePortal()
  {
    static FakePortal portal;
    return portal;
  }


  // Same shape as PipewireGrabber::_initCapture: create the session on a
  // worker thread that spins the default main context until the portal
  // hands back the fd (updateXdgContext flips) or the bound expires.
  bool runHandshake(IRestoreTokenStore& store)
  {
    XdgDesktopPortal::Capture capture;
    capture.restoreTokenStore = &store;
    auto settled = capture.fdReadyPromise.get_future();

    std::thread worker([&capture]{
      XdgDesktopPortal::screencastPortalDesktopCaptureCreate(&capture, XdgDesktopPortal::CaptureType::Monitor, true);
      const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
      while(capture.updateXdgContext && std::chrono::steady_clock::now() < deadline){
        g_main_context_iteration(NULL, FALSE);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    });

    const bool ready = settled.wait_for(std::chrono::seconds(10)) == std::future_status::ready && settled.get();
    worker.join();

    if(ready && capture.pwFd){ close(static_cast<int>(capture.pwFd)); }
    XdgDesktopPortal::screencastPortalCaptureDestroy(&capture);
    return ready;
  }
}


TEST_CASE("A first session asks for persistence, offers no token, and stores the one it is given", "[XdgDesktopPortal][restore-token]")
{
  if(!g_find_program_in_path("dbus-daemon")){ SKIP("dbus-daemon is not installed"); }

  auto& portal = fakePortal();
  portal.setNextStartToken("tok-1");

  RecordingStore store;
  REQUIRE(runHandshake(store));

  const auto calls = portal.selectSourcesCalls();
  REQUIRE(calls.size() == 1);
  CHECK(calls[0].persistMode == 2u);
  CHECK_FALSE(calls[0].restoreToken.has_value());
  CHECK(store.restoreToken() == "tok-1");
  CHECK(store.writes == 1);
}


TEST_CASE("A later session presents the stored token and replaces it with the rotated one", "[XdgDesktopPortal][restore-token]")
{
  if(!g_find_program_in_path("dbus-daemon")){ SKIP("dbus-daemon is not installed"); }

  auto& portal = fakePortal();
  const size_t before = portal.selectSourcesCalls().size();

  RecordingStore store;
  store.setRestoreToken("tok-1");
  store.writes = 0;
  portal.setNextStartToken("tok-2");
  REQUIRE(runHandshake(store));

  const auto calls = portal.selectSourcesCalls();
  REQUIRE(calls.size() == before + 1);
  CHECK(calls.back().persistMode == 2u);
  CHECK(calls.back().restoreToken == "tok-1");
  CHECK(store.restoreToken() == "tok-2");
  CHECK(store.writes == 1);
}


TEST_CASE("A token the backend hands back unchanged is not rewritten", "[XdgDesktopPortal][restore-token]")
{
  if(!g_find_program_in_path("dbus-daemon")){ SKIP("dbus-daemon is not installed"); }

  auto& portal = fakePortal();
  RecordingStore store;
  store.setRestoreToken("tok-same");
  store.writes = 0;
  portal.setNextStartToken("tok-same");
  REQUIRE(runHandshake(store));

  CHECK(store.restoreToken() == "tok-same");
  CHECK(store.writes == 0);
}


TEST_CASE("A backend that returns no token leaves the stored one alone", "[XdgDesktopPortal][restore-token]")
{
  if(!g_find_program_in_path("dbus-daemon")){ SKIP("dbus-daemon is not installed"); }

  auto& portal = fakePortal();
  RecordingStore store;
  store.setRestoreToken("tok-kept");
  store.writes = 0;
  portal.setNextStartToken("");
  REQUIRE(runHandshake(store));

  CHECK(store.restoreToken() == "tok-kept");
  CHECK(store.writes == 0);
}
