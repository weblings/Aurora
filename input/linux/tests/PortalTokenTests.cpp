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
#include <map>
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


  // Which portal call a failure mode applies to.
  enum class Step { CreateSession, SelectSources, Start, OpenRemote };

  // How the fake answers a step. Every mode always replies to the method call
  // (an error mode must not hang the client), and never emits a Response after
  // a D-Bus error.
  enum class Mode
  {
    Ok,
    Deny,          // Response code 1: user cancelled
    Ended,         // Response code 2: interaction ended some other way
    DbusError,     // method call returns a D-Bus error, no Response
    MissingField,  // Response 0 without session_handle / streams
    EmptyStreams,  // Start only: Response 0 with an empty streams array
    ResponseFirst  // Response (code 1) is emitted before the method reply
  };


  class FakePortal
  {
  public:
    // serve=false is a bare bus with no org.freedesktop.portal.Desktop owner.
    explicit FakePortal(bool serve = true) : m_serve(serve)
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

    void setMode(Step step, Mode mode)
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      m_modes[step] = mode;
    }

    void resetModes()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      m_modes.clear();
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
        // Silence stderr: an orphaned daemon (test crashed) must not hold ctest's pipe open.
        static_cast<GSubprocessFlags>(G_SUBPROCESS_FLAGS_STDOUT_PIPE | G_SUBPROCESS_FLAGS_STDERR_SILENCE), &error,
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
    void _respond(const char* sender, const std::string& path, GVariant* results, uint32_t code = 0)
    {
      g_dbus_connection_emit_signal(
        m_connection, sender, path.c_str(), "org.freedesktop.portal.Request", "Response",
        g_variant_new("(u@a{sv})", code, results), NULL
      );
    }

    Mode _mode(Step step)
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      auto it = m_modes.find(step);
      return it == m_modes.end() ? Mode::Ok : it->second;
    }

    static uint32_t _codeFor(Mode mode)
    {
      return mode == Mode::Deny || mode == Mode::ResponseFirst ? 1u : mode == Mode::Ended ? 2u : 0u;
    }

    static GVariant* _emptyResults()
    {
      GVariantBuilder results;
      g_variant_builder_init(&results, G_VARIANT_TYPE_VARDICT);
      return g_variant_builder_end(&results);
    }

    // Replies to the method call, and emits the Response before or after it.
    // g_variant_new adds its own ref to a non-floating variant, so `results` is
    // passed as-is and released here.
    // Returns false when the call was answered with a D-Bus error (no Response).
    bool _answer(
      Step step, const char* sender, const std::string& request,
      GDBusMethodInvocation* invocation, GVariant* okResults
    )
    {
      const Mode mode = _mode(step);
      g_variant_ref_sink(okResults);

      if(mode == Mode::DbusError){
        g_variant_unref(okResults);
        g_dbus_method_invocation_return_dbus_error(invocation, "org.freedesktop.portal.Error.Failed", "fake portal failure");
        return false;
      }

      GVariant* results = (_codeFor(mode) != 0u) ? g_variant_ref_sink(_emptyResults()) : g_variant_ref(okResults);

      if(mode == Mode::ResponseFirst){
        _respond(sender, request, results, _codeFor(mode));
        g_dbus_method_invocation_return_value(invocation, g_variant_new("(o)", request.c_str()));
      }
      else{
        g_dbus_method_invocation_return_value(invocation, g_variant_new("(o)", request.c_str()));
        _respond(sender, request, results, _codeFor(mode));
      }

      g_variant_unref(results);
      g_variant_unref(okResults);
      return true;
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

        GVariantBuilder results;
        g_variant_builder_init(&results, G_VARIANT_TYPE_VARDICT);
        if(_mode(Step::CreateSession) != Mode::MissingField){
          g_variant_builder_add(&results, "{sv}", "session_handle", g_variant_new_string(session.c_str()));
        }
        _answer(Step::CreateSession, sender, request, invocation, g_variant_builder_end(&results));
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
        _answer(Step::SelectSources, sender, request, invocation, _emptyResults());
      }
      else if(method == "Start"){
        g_autoptr(GVariant) options = g_variant_get_child_value(params, 2);
        const std::string request = requestPath(sender, _handleToken(options));
        std::string token;
        {
          std::lock_guard<std::mutex> lock(m_mutex);
          token = m_nextToken;
        }

        const Mode mode = _mode(Step::Start);
        GVariantBuilder results;
        g_variant_builder_init(&results, G_VARIANT_TYPE_VARDICT);
        if(mode == Mode::EmptyStreams){
          g_variant_builder_add(&results, "{sv}", "streams", g_variant_new_parsed("@a(ua{sv}) []"));
        }
        else if(mode != Mode::MissingField){
          g_variant_builder_add(&results, "{sv}", "streams", g_variant_new_parsed("[(uint32 42, @a{sv} {})]"));
        }
        if(!token.empty()){
          g_variant_builder_add(&results, "{sv}", "restore_token", g_variant_new_string(token.c_str()));
        }
        _answer(Step::Start, sender, request, invocation, g_variant_builder_end(&results));
      }
      else if(method == "OpenPipeWireRemote"){
        if(_mode(Step::OpenRemote) == Mode::DbusError){
          g_dbus_method_invocation_return_dbus_error(invocation, "org.freedesktop.portal.Error.Failed", "fake portal failure");
          return;
        }
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

      if(m_serve){
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
      }

      m_loop = g_main_loop_new(m_context, FALSE);
      ready.set_value();
      g_main_loop_run(m_loop);

      g_main_loop_unref(m_loop);
      g_object_unref(m_connection);
      g_main_context_pop_thread_default(m_context);
      g_main_context_unref(m_context);
    }

    const bool m_serve;
    GSubprocess* m_bus{nullptr};
    std::thread m_thread;
    GMainContext* m_context{nullptr};
    GMainLoop* m_loop{nullptr};
    GDBusConnection* m_connection{nullptr};

    std::mutex m_mutex;
    std::string m_nextToken;
    std::map<Step, Mode> m_modes;
    std::vector<SelectSourcesOptions> m_selectCalls;
  };


  // XdgDesktopPortal keeps one process-wide bus connection and proxy, so the
  // fake lives for the whole process and every case below shares it.
  FakePortal& fakePortal()
  {
    static FakePortal portal;
    return portal;
  }


  // Same shape as PipewireGrabber::_initCapture and _stop: the portal handshake
  // runs on a worker thread that spins the default main context until the
  // portal hands back the fd (updateXdgContext flips); the caller waits on the
  // promise, then tears down in _stop()'s order (flag, destroy, join).
  struct Handshake
  {
    bool settled{false};  // the promise settled within the bound
    bool ready{false};    // ... and settled true
    std::chrono::milliseconds elapsed{0};
    std::string failureReason;
  };


  Handshake runHandshakeBounded(IRestoreTokenStore& store, std::chrono::seconds bound)
  {
    XdgDesktopPortal::Capture capture;
    capture.restoreTokenStore = &store;
    auto settled = capture.fdReadyPromise.get_future();

    std::thread worker([&capture]{
      XdgDesktopPortal::screencastPortalDesktopCaptureCreate(&capture, XdgDesktopPortal::CaptureType::Monitor, true);
      const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
      while(capture.updateXdgContext && std::chrono::steady_clock::now() < deadline){
        g_main_context_iteration(NULL, FALSE);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    });

    const auto start = std::chrono::steady_clock::now();
    Handshake result;
    result.settled = settled.wait_for(bound) == std::future_status::ready;
    result.elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start);
    result.ready = result.settled && settled.get();
    if(result.settled){ result.failureReason = capture.failureReason; }

    capture.updateXdgContext = false;
    XdgDesktopPortal::screencastPortalCaptureDestroy(&capture);
    worker.join();

    if(result.ready && capture.pwFd){ close(static_cast<int>(capture.pwFd)); }
    return result;
  }


  bool runHandshake(IRestoreTokenStore& store)
  {
    return runHandshakeBounded(store, std::chrono::seconds(10)).ready;
  }


  // Sets one step's mode for the scope of a test.
  struct ModeScope
  {
    ModeScope(Step step, Mode mode) { fakePortal().setMode(step, mode); }
    ~ModeScope() { fakePortal().resetModes(); }
  };


  // A failed step must settle the promise false, promptly -- not run out
  // PipewireGrabber's 60s bound (Aurora-p91).
  Handshake expectSettlesFalse(Step step, Mode mode)
  {
    if(!g_find_program_in_path("dbus-daemon")){ SKIP("dbus-daemon is not installed"); }

    ModeScope scope(step, mode);
    RecordingStore store;
    const Handshake result = runHandshakeBounded(store, std::chrono::seconds(3));

    REQUIRE(result.settled);
    CHECK_FALSE(result.ready);
    CHECK_FALSE(result.failureReason.empty());
    return result;
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


// Aurora-p91: every non-cancelled failure must settle the fd promise false.

TEST_CASE("A denied CreateSession settles the handshake false", "[XdgDesktopPortal][failure]")
{
  const auto result = expectSettlesFalse(Step::CreateSession, Mode::Deny);
  CHECK(result.failureReason.find("cancelled by the user") != std::string::npos);
}


TEST_CASE("A CreateSession that ended another way settles false", "[XdgDesktopPortal][failure]")
{
  const auto result = expectSettlesFalse(Step::CreateSession, Mode::Ended);
  CHECK(result.failureReason.find("ended by the portal") != std::string::npos);
}


TEST_CASE("A CreateSession call error settles false", "[XdgDesktopPortal][failure]")
{
  const auto result = expectSettlesFalse(Step::CreateSession, Mode::DbusError);
  CHECK(result.failureReason.find("fake portal failure") != std::string::npos);
}


TEST_CASE("A CreateSession reply without session_handle settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::CreateSession, Mode::MissingField);
}


TEST_CASE("A denied SelectSources settles the handshake false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::SelectSources, Mode::Deny);
}


TEST_CASE("A SelectSources call error settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::SelectSources, Mode::DbusError);
}


TEST_CASE("A denied Start settles the handshake false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::Start, Mode::Deny);
}


TEST_CASE("A Start call error settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::Start, Mode::DbusError);
}


TEST_CASE("A Start reply without streams settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::Start, Mode::MissingField);
}


TEST_CASE("A Start reply with an empty streams array settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::Start, Mode::EmptyStreams);
}


TEST_CASE("An OpenPipeWireRemote call error settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::OpenRemote, Mode::DbusError);
}


// The portal docs don't order the method reply before the Response signal, so
// the call's completion callback can run after the Response handler freed it.
TEST_CASE("A Start Response that arrives before the method reply settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::Start, Mode::ResponseFirst);
}


TEST_CASE("A CreateSession Response that arrives before the method reply settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::CreateSession, Mode::ResponseFirst);
}


TEST_CASE("A SelectSources Response that arrives before the method reply settles false", "[XdgDesktopPortal][failure]")
{
  expectSettlesFalse(Step::SelectSources, Mode::ResponseFirst);
}


// The two cases below rely on one TEST_CASE per process (catch_discover_tests
// default): XdgDesktopPortal caches the bus connection and proxy in statics.

TEST_CASE("No session bus settles the handshake false", "[XdgDesktopPortal][failure][isolated]")
{
  g_setenv("DBUS_SESSION_BUS_ADDRESS", "unix:path=/nonexistent/aurora-p91-bus", TRUE);

  RecordingStore store;
  const Handshake result = runHandshakeBounded(store, std::chrono::seconds(3));

  REQUIRE(result.settled);
  CHECK_FALSE(result.ready);
}


TEST_CASE("A bus with no ScreenCast portal settles the handshake false", "[XdgDesktopPortal][failure][isolated]")
{
  if(!g_find_program_in_path("dbus-daemon")){ SKIP("dbus-daemon is not installed"); }

  FakePortal bareBus(false);

  RecordingStore store;
  const Handshake result = runHandshakeBounded(store, std::chrono::seconds(3));

  REQUIRE(result.settled);
  CHECK_FALSE(result.ready);
}
