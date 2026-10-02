// Test-script entry point wiring one Windows input to one or more outputs
// through Orchestrator. Not yet a real product app -- bridge credentials
// still come from env vars, not a persisted pairing flow (see
// docs/ImplementationPlan.md phase 3). Zone maps now have a real REST
// surface (registerZoneRoutes, below, build-order step 14) even though the
// WebUI's own Zone Mapping screen consuming it is still a later step (15) --
// this comment used to claim no zone-mapping UI existed at any layer, which
// is no longer accurate for the backend half. See
// docs/DistributedArchitecturePlan.md for how this shape is expected to
// evolve further.

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <future>
#include <iostream>
#include <mutex>
#include <sstream>
#include <optional>
#include <thread>

#include <windows.h>
#include <shellapi.h>
#include <cstdio>
#include <fstream>
#include "resource.h"

#include <nlohmann/json.hpp>

#include <Aurora/App/FakeHue.hpp>
#include <Aurora/App/InstanceLock.hpp>
#include <Aurora/App/LogSink.hpp>
#include <Aurora/Runtime/Registry.hpp>
#include <Aurora/App/WebRoot.hpp>
#include <EmbeddedWebRoot.hpp>
#ifdef AURORA_GRAPH_EDITOR
#include <GraphEditorWebRoot.hpp>
#endif
#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/ControlDescriptorTables.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/PipelineRoutes.hpp>
#include <Aurora/Runtime/SettingsRoutes.hpp>
#include <Aurora/Runtime/ZoneRoutes.hpp>

#include <Aurora/Input/Windows/DummyGrabber.hpp>
#include <Aurora/Input/Windows/InputControlDescriptors.hpp>
#ifdef AURORA_INPUT_WINDOWS_DXGI_AVAILABLE
#include <Aurora/Input/Windows/WindowsGrabber.hpp>
#endif
#ifdef AURORA_INPUT_WINDOWS_AUDIO_AVAILABLE
#include <Aurora/Input/Windows/AudioGrabber.hpp>
#endif

#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
#include <Aurora/Output/Hue/Credentials.hpp>
#include <Aurora/Output/Hue/CredentialsStore.hpp>
#include <Aurora/Output/Hue/HueOutput.hpp>
#include <Aurora/Output/Hue/PairingRoutes.hpp>
#include <Aurora/Output/Hue/HueControlDescriptors.hpp>
#endif

namespace
{
  // Written from the console handler, the HTTP thread, and the tray thread,
  // read by the tick loop -- must be atomic, not volatile.
  std::atomic<bool> g_stopRequested{false};

  // Console-close/Ctrl+C handler -- Windows has no SIGINT/SIGTERM, this is
  // the console-app equivalent (services would need a different mechanism).
  BOOL WINAPI handleConsoleEvent(DWORD)
  {
    g_stopRequested = true;
    return TRUE;
  }

  // 7l1.1/7l1.2: process-wide log sink. Set by main() right after startup;
  // logLine() falls back to plain cout only before that (never in practice).
  Aurora::App::LogSink* g_logSink = nullptr;
  bool g_consoleAttached = false;

  void logLine(const std::string& line)
  {
    if(g_logSink){
      g_logSink->write(line);
    }
    else{
      std::cout << line << '\n';
    }
  }

  // 7l1.2: dual-mode console. A WINDOWS-subsystem launch starts with no
  // console; rejoin the parent's when there is one (or --console /
  // AURORA_CONSOLE forces one via AllocConsole) so CLI use keeps working.
  // The CRT handles must be reopened onto CONOUT$ either way -- attaching
  // alone leaves stdout/stderr dangling.
  bool attachParentConsole(int argc, char** argv)
  {
    const bool force = Aurora::App::LogSink::wantsConsole(argc, argv);
    bool haveConsole = AttachConsole(ATTACH_PARENT_PROCESS) != FALSE;
    if(!haveConsole && force){
      haveConsole = AllocConsole() != FALSE;
    }
    if(!haveConsole){
      return false;
    }
    std::FILE* out = nullptr;
    std::FILE* err = nullptr;
    freopen_s(&out, "CONOUT$", "w", stdout);
    freopen_s(&err, "CONOUT$", "w", stderr);
    return out != nullptr && err != nullptr;
  }


  // Only one real capture backend exists on Windows so far (unlike Linux's
  // X11-vs-Wayland auto-select) -- "windows" just is DXGI, no dispatch layer.
  void registerInputs(Aurora::Runtime::Registry& registry)
  {
    registry.registerInput("dummy", []{
      return std::make_unique<Aurora::Input::Windows::DummyGrabber>();
    });

#ifdef AURORA_INPUT_WINDOWS_DXGI_AVAILABLE
    registry.registerInput("windows", []{
      return std::make_unique<Aurora::Input::Windows::WindowsGrabber>();
    });
#endif
  }


  void registerAudioInputs(Aurora::Runtime::Registry& registry)
  {
#ifdef AURORA_INPUT_WINDOWS_AUDIO_AVAILABLE
    registry.registerAudioInput("windows-audio", []{
      return std::make_unique<Aurora::Input::Windows::AudioGrabber>();
    });
#endif
  }


  // Hue only gets registered if credentials are actually present -- an
  // unconfigured Hue output shouldn't be selectable at all rather than
  // failing confusingly at construction. Pairing happens through the
  // WebUI's Output Connect step, which re-registers "hue" live once real
  // credentials exist (see the onConnectionChanged callback in main()).
  // CredentialsStore (docs/WebUI/WebUI_Design_1stPass.md's build-order step 4) is
  // checked first; env vars are a dev-only fallback for setups that
  // haven't paired through it yet, not a second, equally-valid source --
  // a persisted connection always wins over env vars when both are set.
  void registerOutputs(Aurora::Runtime::Registry& registry, const std::filesystem::path& configRoot)
  {
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
    Aurora::Output::Hue::CredentialsStore credentialsStore(configRoot);
    Aurora::Output::Hue::HueConnection connection = credentialsStore.load();

    if(!connection.isConfigured()){
      const char* bridgeAddress = std::getenv("AURORA_HUE_BRIDGE_ADDRESS");
      const char* username = std::getenv("AURORA_HUE_USERNAME");
      const char* clientkey = std::getenv("AURORA_HUE_CLIENTKEY");
      // Optional: disambiguates when the bridge has >1 entertainment config --
      // HueOutput's empty-ID default (unordered_map::begin()) is arbitrary then.
      const char* entertainmentConfigId = std::getenv("AURORA_HUE_ENTERTAINMENT_CONFIG_ID");

      if(bridgeAddress && username && clientkey){
        connection.bridgeAddress = bridgeAddress;
        connection.username = username;
        connection.clientkey = clientkey;
        connection.entertainmentConfigurationId = entertainmentConfigId ? entertainmentConfigId : "";
      }
    }

    if(connection.isConfigured()){
      // Re-reads CredentialsStore fresh on every call (not the `connection`
      // captured above) so a reload picks up a changed
      // entertainmentConfigurationId -- e.g. Zone Mapping's picker -- without
      // a process restart. `connection` is kept only as an env-var-fallback
      // safety net for the (shouldn't-happen-once-configured) case the store
      // comes back empty later. See PairingRoutes.hpp's onConnectionChanged.
      registry.registerOutput("hue", [configRoot, connection]{
        Aurora::Output::Hue::HueConnection live = Aurora::Output::Hue::CredentialsStore(configRoot).load();
        if(!live.isConfigured()) live = connection;
        return std::make_unique<Aurora::Output::Hue::HueOutput>(
          Aurora::Output::Hue::Credentials(live.username, live.clientkey),
          live.bridgeAddress,
          live.entertainmentConfigurationId
        );
      });
    }
    // Unconfigured: "hue" simply stays unregistered (and out of the
    // registry) this run, with no startup printout -- a fresh install
    // without credentials is the normal pre-pairing state, and the WebUI's
    // Output Connect step pairs live from here.
#else
    (void)registry;
    (void)configRoot;
#endif
  }


  // Windows's per-app pieces of the shared Pipeline (core/Runtime,
  // Aurora-9ig): every line, info or error, goes through the one log sink.
  Aurora::Runtime::PipelineOptions pipelineOptions()
  {
    Aurora::Runtime::PipelineOptions options;
    options.log = [](Aurora::Runtime::LogLevel, const std::string& line){ logLine(line); };
    return options;
  }


  // Sets the same flag Ctrl+C/console-close already sets (handleConsoleEvent,
  // above) -- the daemon exits through its normal shutdown path (the tick
  // loop below sees g_stopRequested, calls pipelineHost.shutdown(), then
  // main() returns and httpServerThread's own destructor stops this same
  // server), not a special-cased one. Same "stop the whole process, not
  // pause" semantics as huenicorn's real Runtime::stop() (m_keepLooping =
  // false, confirmed by reading it) -- no resume exists, matching this
  // build order's own "Pause is cut for v1" decision (Orchestrator has no
  // concept of holding without exiting its loop).
  void registerStopRoute(Aurora::Network::Http::Server::HttpServer& httpServer)
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Post,
      "/api/stop",
      [](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        res.contentType = "application/json";
        res.body = nlohmann::json{{"succeeded", true}}.dump();
        g_stopRequested = true;
      }
    );
  }


  // First WebUI route: lets a frontend probe which Input/Output plugins this
  // particular binary was actually compiled with, before rendering anything
  // that assumes one exists (docs/WebUI/WebUI_Design_1stPass.md's capability-probe
  // step). No Config dependency, so this can be registered before Config
  // loads -- addRoute() just captures it for bind() to hand to Impl later.
  void registerCapabilitiesRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer,
    const Aurora::Runtime::Registry& registry
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/capabilities",
      [&registry](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        std::vector<std::string> outputs = registry.outputNames();
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
        // registerOutputs() only adds "hue" to registry once credentials
        // are already configured, so the frontend's onboarding gate
        // (app.js's hasHue, DashboardScreen's Bridge row) would never see
        // it on a fresh install otherwise -- this route's contract is
        // "compiled with," not "already paired" (OutputConnectScreen
        // handles pairing itself).
        if(std::find(outputs.begin(), outputs.end(), "hue") == outputs.end()){
          outputs.push_back("hue");
        }
#endif
        nlohmann::json json = {
          {"inputs", registry.inputNames()},
          {"audioInputs", registry.audioInputNames()},
          {"outputs", outputs},
          // Literal per app binary, not runtime-detected -- see
          // app/linux/src/main.cpp's registerCapabilitiesRoute for why.
          {"platform", "windows"}
        };

        res.contentType = "application/json";
        res.body = json.dump();
      }
    );
  }


  // Version probe for the dashboard footer (Aurora-qdk): the single truth
  // is the superbuild project() VERSION, baked in as AURORA_VERSION at
  // compile time (or "dev" for standalone slice configures). No Config
  // dependency, registered alongside the capabilities route.
  void registerVersionRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/version",
      [](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        nlohmann::json json = {
          {"version", AURORA_VERSION}
        };

        res.contentType = "application/json";
        res.body = json.dump();
      }
    );
  }


  // --fresh: rehearse first-run flows (NUX, pairing) against a
  // guaranteed-empty config root. A fixed temp dir, cleared at startup, so
  // repeated runs can never re-soil each other and real config dirs are
  // never read or written. Wins over AURORA_CONFIG_DIR and the default.
  bool isFreshRun(int argc, char** argv)
  {
    for(int i = 1; i < argc; ++i){
      if(std::string(argv[i]) == "--fresh"){
        return true;
      }
    }
    return false;
  }


  std::filesystem::path freshConfigRoot()
  {
    auto fresh = std::filesystem::temp_directory_path() / "aurora-fresh";
    std::filesystem::remove_all(fresh);
    std::filesystem::create_directories(fresh);
    return fresh;
  }


  std::filesystem::path resolveConfigRoot()
  {
    if(const char* override = std::getenv("AURORA_CONFIG_DIR")){
      return std::filesystem::path(override);
    }

    // %APPDATA%\Aurora -- same convention huenicorn's own WindowsAdapter
    // used (%APPDATA%\Huenicorn), not the Linux app's $HOME/.config path.
    const char* appData = std::getenv("APPDATA");
    if(!appData){
      throw std::runtime_error("Neither AURORA_CONFIG_DIR nor APPDATA is set");
    }

    return std::filesystem::path(appData) / "Aurora";
  }


  // "0.0.0.0" is what a socket binds to, not something a browser can
  // navigate to -- browsers vary in whether/how they alias it, so surface
  // loopback instead. A real bound-to-a-LAN-IP config still prints as-is.
  std::string browsableAddress(const std::string& boundBackendIP)
  {
    return boundBackendIP == "0.0.0.0" ? "127.0.0.1" : boundBackendIP;
  }


  // Best-effort -- a failure here shouldn't stop the app, the printed URL
  // above is still there as a fallback.
  void openWebBrowser(const std::string& url)
  {
    ShellExecuteA(nullptr, "open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  }


  // OSC 8 terminal hyperlink -- needs ENABLE_VIRTUAL_TERMINAL_PROCESSING,
  // which legacy conhost doesn't turn on by default.
  void printClickableLink(const std::string& url)
  {
    HANDLE stdOut = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    if(stdOut != INVALID_HANDLE_VALUE && GetConsoleMode(stdOut, &mode)){
      SetConsoleMode(stdOut, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
    }
    logLine(std::string("WebUI: \033]8;;") + url + "\033\\" + url + "\033]8;;\033\\");
  }


  // RAII wrapper so the server is stopped and its thread joined on every
  // exit path (early "no outputs"/"unknown input" returns included) --
  // std::thread::~thread() calls std::terminate() if it's still joinable,
  // so this can't be left to a single manual stop()/join() at the tail end.
  class HttpServerThread
  {
  public:
    HttpServerThread(Aurora::Network::Http::Server::HttpServer& server, std::thread thread):
    m_server(server),
    m_thread(std::move(thread))
    {
    }

    ~HttpServerThread()
    {
      m_server.stop();
      m_thread.join();
    }

  private:
    Aurora::Network::Http::Server::HttpServer& m_server;
    std::thread m_thread;
  };

// Aurora-x2o.1: notification-area presence. Message-only window
// (no visible UI) receives the tray callback; the icon is the
// IDI_ICON1 resource embedded via app.rc, so no .ico path lookup.
// Best-effort by design: without Explorer there is simply no icon,
// and the app still serves the WebUI with the terminal print as
// fallback. Right-click menu added in x2o.2.
LRESULT CALLBACK trayWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);


class TrayIcon
{
public:
  // Aurora-zlw: the tray owns its own thread -- windows, notification icon
  // and message loop all live there. TrackPopupMenuEx runs a modal loop that
  // blocks its calling thread until the menu closes; on the tick-loop thread
  // that froze the whole pipeline while a menu was open. (Win32 window
  // affinity is per creating thread, not "the main thread", so unlike
  // AppKit this needs no change to the tick loop.) The constructor blocks
  // until the thread has finished setup and rethrows its failure, so
  // callers see the same throw-on-window-failure contract as before.
  explicit TrayIcon(const std::string& url, bool webUiBound)
    : m_url(url),
      m_webUiBound(webUiBound)
  {
    // Retrieve the future before moving the promise into the thread -- the
    // Aurora-nzd bug class (get_future on a moved-from promise).
    std::promise<DWORD> ready;
    std::future<DWORD> readyFuture = ready.get_future();
    m_thread = std::thread([this, ready = std::move(ready)]() mutable { run(std::move(ready)); });
    try{
      m_threadId = readyFuture.get();
    }
    catch(...){
      m_thread.join();
      throw;
    }
  }

  ~TrayIcon()
  {
    // A thread-posted WM_QUIT is not seen while TrackPopupMenuEx's modal loop
    // is running, so a Stop from elsewhere (HTTP, Ctrl+C) with a menu open
    // would hang here. WM_CANCELMODE dismisses the menu; the queued WM_QUIT
    // is then picked up by the message loop. Teardown (NIM_DELETE,
    // DestroyWindow) happens on the tray thread, which owns those handles.
    PostThreadMessageA(m_threadId, WM_QUIT, 0, 0);
    SendMessageTimeoutA(m_window, WM_CANCELMODE, 0, 0, SMTO_ABORTIFHUNG, 2000, nullptr);
    m_thread.join();
  }

  // Right-click menu (x2o.2): Launch UI opens the bound URL, Stop sets
  // the same g_stopRequested flag Ctrl+C sets, so shutdown unwinding
  // (NIM_DELETE above, pipeline shutdown, server stop) is identical.
  void showMenu()
  {
    HMENU menu = CreatePopupMenu();
    if(!menu){
      return;
    }
    AppendMenuA(menu, MF_STRING | (m_webUiBound ? MF_ENABLED : MF_GRAYED),
      IDM_LAUNCH_UI, "Launch UI");
    AppendMenuA(menu, MF_STRING, IDM_STOP, "Stop");
    POINT cursor{};
    GetCursorPos(&cursor);
    // Required so the menu dismisses correctly and the next
    // right-click re-opens it.
    SetForegroundWindow(m_window);
    const UINT picked = TrackPopupMenuEx(menu,
      TPM_RETURNCMD | TPM_RIGHTBUTTON, cursor.x, cursor.y, m_window, nullptr);
    DestroyMenu(menu);
    // KB135788: lets the next right-click re-open the menu.
    PostMessageA(m_window, WM_NULL, 0, 0);
    if(picked == IDM_LAUNCH_UI){
      openWebBrowser(m_url);
    }
    else if(picked == IDM_STOP){
      g_stopRequested = true;
    }
  }

  // First-run balloon (x2o.3): one-shot orientation hint, gated by a
  // sentinel file in the config root (no config-schema change).
  // Best-effort: without Explorer, or if the sentinel cannot be
  // written, it simply retries next launch.
  void showFirstRunBalloon(const std::filesystem::path& configRoot)
  {
    if(!m_added){
      return;
    }
    std::error_code ec;
    const auto sentinel = configRoot / "tray-balloon.seen";
    if(std::filesystem::exists(sentinel, ec)){
      return;
    }
    m_icon.uFlags |= NIF_INFO;
    std::snprintf(m_icon.szInfo, sizeof(m_icon.szInfo), "%s",
      "Running in the background - right-click tray icon for Launch UI or Stop");
    std::snprintf(m_icon.szInfoTitle, sizeof(m_icon.szInfoTitle), "%s", "Aurora");
    m_icon.dwInfoFlags = NIIF_INFO;
    if(Shell_NotifyIconA(NIM_MODIFY, &m_icon)){
      std::ofstream(sentinel).close();
    }
    m_icon.uFlags &= static_cast<decltype(m_icon.uFlags)>(~NIF_INFO);
  }

  TrayIcon(const TrayIcon&) = delete;
  TrayIcon& operator=(const TrayIcon&) = delete;

private:
  // Tray thread body. Sets up, signals the constructor, pumps messages until
  // WM_QUIT, then tears down on this same thread.
  void run(std::promise<DWORD> ready)
  {
    const std::string tip = std::string("Aurora - ")
      + (m_webUiBound ? m_url : std::string("WebUI unavailable"));
    HINSTANCE instance = GetModuleHandleA(nullptr);
    WNDCLASSEXA cls{};
    cls.cbSize = sizeof(cls);
    cls.lpfnWndProc = trayWndProc;
    cls.hInstance = instance;
    cls.lpszClassName = "AuroraTrayWindow";
    RegisterClassExA(&cls);
    m_window = CreateWindowExA(0, "AuroraTrayWindow", "Aurora", 0,
      0, 0, 0, 0, HWND_MESSAGE, nullptr, instance, nullptr);
    if(!m_window){
      ready.set_exception(std::make_exception_ptr(
        std::runtime_error("Cannot create tray message window")));
      return;
    }
    // 7l1.5: shutdown delivery. Session-ending broadcasts go to top-level
    // windows only -- the HWND_MESSAGE tray window above never receives them
    // (docs/lessons/windows-env.md). Never shown; destroyed with the tray.
    m_sessionWindow = CreateWindowExA(0, "AuroraTrayWindow", "AuroraShutdown", 0,
      0, 0, 0, 0, nullptr, nullptr, instance, nullptr);
    SetWindowLongPtrA(m_window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
    m_icon.cbSize = sizeof(m_icon);
    m_icon.hWnd = m_window;
    m_icon.uID = 1;
    m_icon.uFlags = NIF_ICON | NIF_TIP | NIF_MESSAGE;
    m_icon.uCallbackMessage = WM_TRAYICON;
    m_icon.hIcon = LoadIconA(instance, MAKEINTRESOURCEA(IDI_ICON1));
    std::snprintf(m_icon.szTip, sizeof(m_icon.szTip), "%s", tip.c_str());
    m_added = Shell_NotifyIconA(NIM_ADD, &m_icon) != FALSE;
    if(!m_added){
      logLine("No notification area -- running without tray icon");
    }

    // Force this thread's message queue into existence so the destructor's
    // PostThreadMessage(WM_QUIT) cannot be lost, then release the constructor.
    MSG msg;
    PeekMessageA(&msg, nullptr, WM_USER, WM_USER, PM_NOREMOVE);
    ready.set_value(GetCurrentThreadId());

    while(GetMessageA(&msg, nullptr, 0, 0) > 0){
      TranslateMessage(&msg);
      DispatchMessageA(&msg);
    }

    if(m_added){
      Shell_NotifyIconA(NIM_DELETE, &m_icon);
    }
    if(m_sessionWindow){
      DestroyWindow(m_sessionWindow);
    }
    DestroyWindow(m_window);
  }

  std::thread m_thread;
  DWORD m_threadId{0};
  HWND m_window{nullptr};
  HWND m_sessionWindow{nullptr};
  NOTIFYICONDATAA m_icon{};
  bool m_added{false};
  std::string m_url;
  bool m_webUiBound{false};
};

LRESULT CALLBACK trayWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
  // 7l1.5: session-end listener. Handled before anything window-specific so
  // the hidden top-level window (which shares this proc) is covered too.
  if(msg == WM_QUERYENDSESSION){
    return TRUE;
  }
  if(msg == WM_ENDSESSION){
    if(wParam){
      g_stopRequested = true;
    }
    return 0;
  }
  (void)wParam;
  if(msg == WM_TRAYICON){
    auto* self = reinterpret_cast<TrayIcon*>(GetWindowLongPtrA(hwnd, GWLP_USERDATA));
    if(self && lParam == WM_RBUTTONUP){
      self->showMenu();
    }
    return 0;
  }
  return DefWindowProcA(hwnd, msg, wParam, lParam);
}
}


int main(int argc, char** argv)
try
{
  SetConsoleCtrlHandler(handleConsoleEvent, TRUE);
  Aurora::App::LogSink sink;
  g_logSink = &sink;
  const bool consoleAttached = attachParentConsole(argc, argv);
  g_consoleAttached = consoleAttached;
  sink.setConsole(consoleAttached ? &std::cout : nullptr);

  // --fake-hue: preset the fake-bridge dev flow (see FakeHue.hpp).
  // Explicit env wins over the presets; applied before anything reads env.
  if(Aurora::App::hasCliFlag(argc, argv, "--fake-hue")){
    Aurora::App::applyFakeHueDefaults();
    logLine("Hue: fake-bridge defaults (override via AURORA_HUE_* env)");
  }

  // Resolved before registry setup now (unlike before CredentialsStore
  // existed) -- registerOutputs needs it to look up any persisted Hue
  // connection.
  std::filesystem::path configRoot;
  if(isFreshRun(argc, argv)){
    configRoot = freshConfigRoot();
    std::ostringstream configRootMsg;
    configRootMsg << "Config root: " << configRoot.string() << " (--fresh: guaranteed empty)";
    logLine(configRootMsg.str());
  }
  else{
    configRoot = resolveConfigRoot();
  }
  if(!sink.setFile(configRoot / "aurora.log")){
    // Decided fallback (7l1 notes): %TEMP% when the config root is unusable.
    std::error_code ec;
    const auto fallback = std::filesystem::temp_directory_path(ec) / "Aurora" / "aurora.log";
    if(!ec){
      std::filesystem::create_directories(fallback.parent_path(), ec);
      sink.setFile(fallback);
    }
  }

// Aurora-52o: one running instance per config root. A second launch
// hands the UI to the running instance (same configured URL it holds)
// instead of starting headless.
Aurora::App::InstanceLock instanceLock(configRoot);
if(!instanceLock.held()){
  Aurora::Runtime::Config liveConfig = Aurora::Runtime::ConfigStore(configRoot).load();
  std::string url = "http://" + browsableAddress(liveConfig.boundBackendIP())
    + ":" + std::to_string(liveConfig.restServerPort()) + "/";
  // Name the holder and probe its port: a lock held by a process wedged
  // before its HTTP bind (Aurora-kwn) otherwise reads exactly like a
  // healthy handoff. Silent unless attached (7l1.3); the browser still
  // opens either way, surfacing the wedge via unreachable+Retry.
  const std::uint64_t holder = instanceLock.holderPid();
  if(consoleAttached){
    if(holder != 0 && !Aurora::App::isLoopbackPortResponsive(liveConfig.restServerPort())){
      std::ostringstream wedgedMsg;
      wedgedMsg << "Aurora is already running (pid " << holder << ") but is not responding at "
        << url << " -- it may be wedged before its HTTP bind; stop that process and relaunch if this persists";
      logLine(wedgedMsg.str());
    }
    else{
      logLine("Aurora is already running -- opening " + url + " instead");
    }
  }
  openWebBrowser(url);
  return 0;
}
  // TEMP DEBUG -- remove after live pairing repro (see WebUI/WebUI_Fixes.md).
  // Debug-only: Release builds must not print it.
#ifndef NDEBUG
  std::ostringstream pairingMsg;
  pairingMsg << "[pairing-debug] configRoot=" << configRoot;
  logLine(pairingMsg.str());
#endif

  // Captured before ConfigStore/Pipeline ever touch this configRoot --
  // Pipeline::build() unconditionally re-saves config.json on every launch
  // (see its refreshRate/subsampleWidth persist), so this must be read
  // before that or it would always see the file as already existing.
  bool isFirstSetup = !std::filesystem::exists(configRoot / "config.json");

  Aurora::Runtime::ConfigStore configStore(configRoot);
  Aurora::Runtime::Config config = configStore.load();

  Aurora::Runtime::Registry registry;
  registerInputs(registry);
  registerAudioInputs(registry);
  registerOutputs(registry, configRoot);

  // Built before any route is registered below -- the settings/reload routes
  // capture pipelineHost by reference, so it has to exist first. A failure
  // here (e.g. a fresh install with no output paired yet) is no longer
  // fatal -- the WebUI still needs to bind so Output Connect is reachable;
  // see WebUI/WebUI_Fixes.md's "HTTP server never binds" task. A later
  // failed *reload* is handled the same way; see PipelineHost::reload.
  std::unique_ptr<Aurora::Runtime::Pipeline> initialPipeline;
  try{
    initialPipeline = Aurora::Runtime::Pipeline::build(registry, config, configRoot, pipelineOptions());
  }
  catch(const std::exception& e){
    logLine(std::string("Pipeline not started (") + e.what() + ") -- WebUI still available for setup");
  }
  Aurora::Runtime::PipelineHost pipelineHost(std::move(initialPipeline), pipelineOptions());

  Aurora::Network::Http::Server::HttpServer httpServer;
  registerCapabilitiesRoute(httpServer, registry);
  registerVersionRoute(httpServer);

  // Tooltip descriptors (docs/TooltipsAnalysis.md): every layer
  // contributes its own control descriptions; the frontend looks them
  // up purely by key.
  Aurora::Runtime::DescriptorRegistry descriptorRegistry;
  descriptorRegistry.add("video", Aurora::Runtime::videoControlDescriptors());
  descriptorRegistry.add("input", Aurora::Input::Windows::windowsInputControlDescriptors());
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
  descriptorRegistry.add("audio", Aurora::Runtime::audioControlDescriptors());
#endif
  descriptorRegistry.add("zones", Aurora::Runtime::zoneControlDescriptors());
  descriptorRegistry.add("app", Aurora::Runtime::appControlDescriptors());
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
  descriptorRegistry.add("hue", Aurora::Output::Hue::hueControlDescriptors());
#endif
  for(const auto& collision : descriptorRegistry.collisions()){
    std::ostringstream descriptorsMsg;
    descriptorsMsg << "[descriptors] collision on '" << collision.key
                   << "': kept '" << collision.keptOwner
                   << "', dropped '" << collision.droppedOwner << "'";
    logLine(descriptorsMsg.str());
  }
  Aurora::Runtime::registerDescriptorRoutes(httpServer, descriptorRegistry);
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
  Aurora::Output::Hue::registerPairingRoutes(httpServer, configRoot,
    [&pipelineHost, &registry, configRoot]() -> std::string {
      // registerOutputs() only ever registered "hue" once, at startup,
      // gated on whatever CredentialsStore held then -- a fresh pairing
      // this same session (Output Connect, Entertainment zone select) can
      // be the very first time real credentials exist, and without this,
      // "hue" stays permanently absent from registry for the rest of the
      // process even though it's now genuinely configured (Registry's own
      // registerOutput() is a plain map assignment, safe to repeat).
      // Otherwise the next reload -- typically Mode+Device Select's own
      // save, right after onboarding -- throws "No outputs available"
      // even though pairing just succeeded. Found live, see
      // WebUI_Fixes.md's Pass 2 section.
      registerOutputs(registry, configRoot);
      return Aurora::Runtime::reloadPipelineFromDisk(pipelineHost, registry, configRoot);
    }
  );
#endif
  // Re-loads Config fresh (reflecting whatever the PUT that triggered this
  // just saved) rather than closing over the request's own already-stale
  // copy, then applies it live if only tuning fields changed, else reloads
  // the pipeline (Aurora-c0g).
  Aurora::Runtime::registerSettingsRoutes(httpServer, configRoot,
    [&pipelineHost, &registry, configRoot]() -> std::string {
      return Aurora::Runtime::applyConfigFromDisk(pipelineHost, registry, configRoot);
    }
  );
  Aurora::Runtime::registerMonitorsRoute(httpServer, pipelineHost);
  Aurora::Runtime::registerReloadRoute(httpServer, pipelineHost, registry, configRoot);
  registerStopRoute(httpServer);
  Aurora::Runtime::registerZoneRoutes(
    httpServer,
    [&pipelineHost]{ return pipelineHost.listZones(); },
    [&pipelineHost](std::uint8_t zoneId, const auto& uvs, const auto& active, const auto& gamma){
      return pipelineHost.updateZone(zoneId, uvs, active, gamma);
    }
  );

  // WebUI static files -- must be set before bind() per HttpServer's own contract.
  // per HttpServer's own contract. AURORA_WEBUI_SOURCE_DIR is baked in at
  // configure time (see CMakeLists.txt); editing WebUI files during dev needs
  // no rebuild; a moved tree without the checkout falls back to the embedded webroot.
  // Probe order: AURORA_WEBUI_DIR override > baked source dir (dev) >
  // embedded webroot (standalone builds) -- see Aurora::App::resolveWebRoot.
  auto webDir = Aurora::App::resolveWebRoot(std::getenv("AURORA_WEBUI_DIR"), AURORA_WEBUI_SOURCE_DIR);
  if(webDir.has_value()){
    httpServer.serveStaticFiles(*webDir);
  }
  else{
    httpServer.serveEmbeddedFiles(Aurora::EmbeddedWebRoot::files);
  }

#ifdef AURORA_GRAPH_EDITOR
  // Graph editor (Aurora-lzj): always the embedded bundle, in dev and
  // standalone runs alike -- the dev web/ui mount above never reaches it.
  httpServer.serveEmbeddedFilesAt("/graph-editor/", Aurora::GraphEditorWebRoot::files);
#endif

  // Own thread, same as huenicorn's real Runtime::_initWebUI (see
  // docs/HttpServerAnalysis.md) -- listen() blocks until stop() is
  // called, so it can never share the tick-loop thread below. A bind
  // failure (e.g. port already in use) logs and continues without the
  // WebUI rather than aborting the whole app. HttpServerThread's destructor
  // stops and joins on every exit path below, not just the happy one.
  // Declared after pipelineHost so it's destroyed (and the server stopped)
  // first on the way out -- same order as the explicit calls below.
  std::optional<HttpServerThread> httpServerThread;
  const bool webUiBound = httpServer.bind(config.boundBackendIP(), config.restServerPort());
  std::string url;
  if(webUiBound){
    httpServerThread.emplace(httpServer, std::thread([&httpServer]{ httpServer.listen(); }));
    url = "http://" + browsableAddress(config.boundBackendIP())
      + ":" + std::to_string(config.restServerPort()) + "/";
    if(isFirstSetup){
      logLine("WebUI: opening " + url + " in your browser");
      openWebBrowser(url);
    }
    else{
      printClickableLink(url);
    }
  }
  else{
    std::ostringstream bindMsg;
    bindMsg << "Could not bind WebUI to " << config.boundBackendIP() << ":" << config.restServerPort()
            << " -- continuing without it";
    logLine(bindMsg.str());
  }

  logLine(Aurora::App::LogSink::runningLine(consoleAttached));

  // Aurora-x2o.1: tray presence from here until scope exit (NIM_DELETE
  // in the destructor, including unwinding on exceptions below).
  TrayIcon trayIcon(url, webUiBound);
  trayIcon.showFirstRunBalloon(configRoot);

  // Drives whichever Pipeline is current at the top of each iteration -- a
  // reload swapping it mid-loop is exactly what PipelineHost's own lock is
  // for; this loop never needs to know a swap happened.
  while(!g_stopRequested){
    auto tickStart = std::chrono::steady_clock::now();
    pipelineHost.tick();
    auto tickInterval = std::chrono::duration<double>(pipelineHost.tickIntervalSeconds());
    std::this_thread::sleep_until(tickStart + std::chrono::duration_cast<std::chrono::steady_clock::duration>(tickInterval));
  }

  logLine("Stopping...");
  pipelineHost.shutdown();

  // httpServerThread stops and joins the WebUI in its destructor as this
  // scope unwinds -- after this point, same order huenicorn's own
  // Runtime::_startStreamingLoop uses, and on every early return above too
  // (std::thread::~thread() would std::terminate() otherwise if one of
  // those had left it running unjoined).
  return 0;
}
// Plugin construction (e.g. "windows" input selection) can throw --
// catch here so that's a clean error message, not std::terminate.
catch(const std::exception& e)
{
  // 7l1.4: the ONLY site that boxes. Headless early-fatals would otherwise
  // look like "double-click does nothing".
  const std::string fatal = std::string("Fatal: ") + e.what();
  if(g_logSink){
    g_logSink->write(fatal);
  }
  else{
    std::cerr << fatal << '\n';
  }
  std::string text = std::string("Aurora failed to start:\n") + e.what();
  if(g_logSink && g_logSink->hasFile()){
    text += "\n\nDetails in " + g_logSink->filePath().string();
  }
  MessageBoxA(nullptr, text.c_str(), "Aurora", MB_OK | MB_ICONERROR);
  return 1;
}
