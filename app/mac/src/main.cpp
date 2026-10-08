// Mac terminal/tray tier (docs/MacSupport.md, Aurora-8mk + Aurora-qps):
// ported from app/linux's main.cpp, minus the X11/Pipewire backend-
// selection dance (macOS has exactly one capture API -- "mac", input/mac's
// ScreenCaptureKit grabber, Aurora-8mk.5). NSStatusItem tray presence
// landed in Aurora-qps.2; LSUIElement agent mode and SMAppService login
// items are still later tray-parity phases (Aurora-qps.3/.6) -- see
// "Tray-parity" in the doc. Bridge credentials still come from env vars or
// a persisted pairing flow, same as app/linux.

#include <algorithm>
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <optional>
#include <thread>

#include <nlohmann/json.hpp>

#include <Aurora/App/AudioPermissionPublisher.hpp>
#include <Aurora/App/Cli.hpp>
#include <Aurora/App/FakeHue.hpp>
#include <Aurora/App/InstanceLock.hpp>
#include <Aurora/App/LocalNetworkProbe.hpp>
#include <Aurora/Runtime/Registry.hpp>
#include <Aurora/App/TrayIcon.hpp>
#include <Aurora/App/WebRoot.hpp>
#include <EmbeddedWebRoot.hpp>
#ifdef AURORA_GRAPH_EDITOR
#include <GraphEditorWebRoot.hpp>
#endif
#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/ControlDescriptorTables.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/PendingRunRequest.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/PipelineRoutes.hpp>
#include <Aurora/Runtime/SettingsRoutes.hpp>
#include <Aurora/Runtime/ZoneRoutes.hpp>

#include <Aurora/Input/Mac/DummyGrabber.hpp>
#include <Aurora/Input/Mac/InputControlDescriptors.hpp>
#include <Aurora/Input/Mac/ScreenCaptureKitGrabber.hpp>
#ifdef AURORA_INPUT_MAC_AUDIO_AVAILABLE
#include <Aurora/Input/Mac/MacAudioGrabber.hpp>
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
  // Written from the signal handler, HTTP thread and tray callback; read by
  // the main and tick threads. Lock-free, so signal-safe (Aurora-zlw).
  std::atomic<bool> g_stopRequested{false};
  static_assert(std::atomic<bool>::is_always_lock_free);

  void handleStopSignal(int)
  {
    g_stopRequested = true;
  }


  // "dummy" stays registered alongside "mac" -- no backend-selection dance
  // needed the way Linux's X11/Wayland-portal/Gamescope-PipeWire runtime
  // choice does (macOS has exactly one capture API), but dummy is still
  // useful as a no-permission-needed dev/test target. Default activeInput
  // (see below) stays "dummy" so a fresh install never triggers a Screen
  // Recording prompt before the user has opted in via the WebUI.
  void registerInputs(Aurora::Runtime::Registry& registry)
  {
    registry.registerInput("dummy", []{
      return std::make_unique<Aurora::Input::Mac::DummyGrabber>();
    });

    registry.registerInput("mac", []{
      return std::make_unique<Aurora::Input::Mac::ScreenCaptureKitGrabber>();
    });
  }


  // No config parameter needed here, unlike app/linux's own
  // registerAudioInputs (Config::audioTargetSinkName) -- the whole-system
  // tap (initStereoGlobalTapButExcludeProcesses with an empty exclude list,
  // Aurora-9z4.3) has no per-sink/per-device selection concept to resolve.
  void registerAudioInputs(Aurora::Runtime::Registry& registry)
  {
#ifdef AURORA_INPUT_MAC_AUDIO_AVAILABLE
    registry.registerAudioInput("mac-audio", []{
      return std::make_unique<Aurora::Input::Mac::MacAudioGrabber>();
    });
#else
    (void)registry;
#endif
  }


  // Hue only gets registered if credentials are actually present -- an
  // unconfigured Hue output shouldn't be selectable at all rather than
  // failing confusingly at construction. Pairing happens through the
  // WebUI's Output Connect step, which re-registers "hue" live once real
  // credentials exist (see the onConnectionChanged callback in main()).
  // CredentialsStore is checked first; env vars are a dev-only fallback for
  // setups that haven't paired through it yet, not a second, equally-valid
  // source -- a persisted connection always wins over env vars when both
  // are set. Platform-agnostic -- identical to app/linux's own.
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


  // ~/Library/Application Support/Aurora -- Mac's idiomatic location for
  // app-owned data files (~/Library/Preferences is reserved for
  // plist-backed NSUserDefaults, which this isn't; see docs/MacSupport.md).
  // Same AURORA_CONFIG_DIR override pattern as Linux/Windows.
  std::filesystem::path resolveConfigRoot()
  {
    if(const char* override = std::getenv("AURORA_CONFIG_DIR")){
      return std::filesystem::path(override);
    }

    const char* home = std::getenv("HOME");
    if(!home){
      throw std::runtime_error("Neither AURORA_CONFIG_DIR nor HOME is set");
    }

    return std::filesystem::path(home) / "Library" / "Application Support" / "Aurora";
  }


  // "0.0.0.0" is what a socket binds to, not something a browser can
  // navigate to -- browsers vary in whether/how they alias it, so surface
  // loopback instead. A real bound-to-a-LAN-IP config still prints as-is.
  std::string browsableAddress(const std::string& boundBackendIP)
  {
    return boundBackendIP == "0.0.0.0" ? "127.0.0.1" : boundBackendIP;
  }


  // Best-effort -- a failure here shouldn't stop the app, the printed URL
  // above is still there as a fallback. macOS's `open` is the platform
  // equivalent of Linux's xdg-open for this purpose.
  void openWebBrowser(const std::string& url)
  {
    std::system(("open '" + url + "' >/dev/null 2>&1 &").c_str());
  }


  // OSC 8 terminal hyperlink -- Terminal.app and iTerm2 both support this
  // with no extra setup, same as most Linux terminal emulators.
  void printClickableLink(const std::string& url)
  {
    std::cout << "WebUI: \033]8;;" << url << "\033\\" << url << "\033]8;;\033\\\n";
  }


  // Mac's per-app pieces of the shared Pipeline (core/Runtime, Aurora-9ig).
  Aurora::Runtime::PipelineOptions pipelineOptions()
  {
    Aurora::Runtime::PipelineOptions options;
    options.noAudioSupportMessage =
      "activeAudioInputName is set, but this build has no audio support "
      "(no Mac audio input exists yet -- docs/MacSupport.md, 'Deferred: audio')";
    options.describeBuildError = [](const std::exception& e) -> std::string {
      // Stable prefix (not a separate JSON field -- SettingsRoutes'
      // onConfigChanged contract is shared with linux/windows, which have
      // nothing analogous to put there) the WebUI checks for
      // (MacPermissionRecovery.js) to show its System-Settings-recovery
      // state (Aurora-8mk.8) instead of the generic "couldn't apply it
      // live" sentence every other reload failure gets.
      if(auto* permission = dynamic_cast<const Aurora::Input::Mac::PermissionError*>(&e)){
        using Aurora::Input::Mac::PermissionErrorKind;
        return (permission->kind == PermissionErrorKind::Denied ? "permission_denied: " : "permission_pending: ")
          + std::string(e.what());
      }
      return e.what();
    };
    return options;
  }


  // Whether the live audio input is a MacAudioGrabber that looks
  // permission-denied (false in video mode, with no pipeline, or with some
  // other audio input). MacAudioGrabber::isLikelyPermissionDenied() has no
  // explicit pending/denied signal to report synchronously at
  // Pipeline::build() time the way ScreenCaptureKitGrabber's
  // PermissionError does -- see docs/MacSupport.md's audio section -- so
  // this is polled at runtime instead of thrown at construction.
  bool audioPermissionLikelyDenied(Aurora::Runtime::PipelineHost& pipelineHost)
  {
#ifdef AURORA_INPUT_MAC_AUDIO_AVAILABLE
    return pipelineHost.withAudioInput([](Aurora::Input::IAudioInput* input){
      auto* macAudio = dynamic_cast<Aurora::Input::Mac::MacAudioGrabber*>(input);
      return macAudio && macAudio->isLikelyPermissionDenied();
    });
#else
    (void)pipelineHost;
    return false;
#endif
  }


  // Sets the same flag SIGINT/SIGTERM already sets (the signal handler,
  // above) -- the daemon exits through its normal shutdown path (the tick
  // loop below sees g_stopRequested, calls pipelineHost.shutdown(), then
  // main() returns and httpServerThread's own destructor stops this same
  // server), not a special-cased one.
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
  // that assumes one exists. No Config dependency, so this can be
  // registered before Config loads -- addRoute() just captures it for
  // bind() to hand to Impl later.
  void registerCapabilitiesRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer,
    const Aurora::Runtime::Registry& registry,
    const Aurora::Runtime::PipelineHost& pipelineHost
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/capabilities",
      [&registry, &pipelineHost](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        std::vector<std::string> outputs = registry.outputNames();
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
        // registerOutputs() only adds "hue" to registry once credentials
        // are already configured, so the frontend's onboarding gate
        // would never see it on a fresh install otherwise -- this route's
        // contract is "compiled with," not "already paired" (OutputConnectScreen
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
          {"platform", "mac"},
          // In-memory pause (Aurora-3ddb); read lock-free like the rest.
          {"paused", pipelineHost.isPaused()}
        };

        res.contentType = "application/json";
        res.body = json.dump();
      }
    );
  }


  // Version probe for the dashboard footer: the single truth is the
  // superbuild project() VERSION, baked in as AURORA_VERSION at compile
  // time (or "dev" for standalone slice configures). No Config dependency,
  // registered alongside the capabilities route.
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


  // Local Network permission state for the Connect screen (Aurora-o1qt): a
  // bridge that fails instantly may just be blocked by macOS.
  void registerLocalNetworkRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer,
    Aurora::App::LocalNetworkProbe& probe
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/mac/local-network",
      [&probe](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        res.contentType = "application/json";
        res.body = nlohmann::json{{"status", Aurora::App::toString(probe.recheck())}}.dump();
      }
    );
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
}


int main(int argc, char** argv)
try
{
  std::signal(SIGINT, handleStopSignal);
  std::signal(SIGTERM, handleStopSignal);

  // --help / --version / unknown-argument rejection (Aurora-0gd,
  // Aurora-v3in): handled before anything boots -- no InstanceLock, no
  // --fresh wipe of the temp dir, no pipeline, no port bind.
  if(auto cliExit = Aurora::App::handleEarlyCli(argc, argv, AURORA_VERSION, /*withConsoleFlag=*/false, std::cout, std::cerr)){
    return *cliExit;
  }

  // --fake-hue: preset the fake-bridge dev flow (see FakeHue.hpp).
  // Explicit env wins over the presets; applied before anything reads env.
  if(Aurora::App::hasCliFlag(argc, argv, "--fake-hue")){
    Aurora::App::applyFakeHueDefaults();
    std::cout << "Hue: fake-bridge defaults (override via AURORA_HUE_* env)\n";
  }

  std::filesystem::path configRoot;
  if(isFreshRun(argc, argv)){
    configRoot = freshConfigRoot();
    std::cout << "Config root: " << configRoot.string() << " (--fresh: guaranteed empty)\n";
  }
  else{
    configRoot = resolveConfigRoot();
  }

  // One running instance per config root. A second launch hands the UI to
  // the running instance (same configured URL it holds) instead of
  // starting headless.
  Aurora::App::InstanceLock instanceLock(configRoot);
  if(!instanceLock.held()){
    Aurora::Runtime::Config liveConfig = Aurora::Runtime::ConfigStore(configRoot).load();
    std::string url = "http://" + browsableAddress(liveConfig.boundBackendIP())
      + ":" + std::to_string(liveConfig.restServerPort()) + "/";
    // Name the holder and probe its port: a lock held by a process wedged
    // before its HTTP bind otherwise reads exactly like a healthy handoff.
    // The browser still opens either way -- with the UI's
    // unreachable+Retry state, that surfaces the wedge instead of hiding it.
    const std::uint64_t holder = instanceLock.holderPid();
    if(holder != 0 && !Aurora::App::isLoopbackPortResponsive(liveConfig.restServerPort())){
      std::cout << "Aurora is already running (pid " << holder << ") but is not responding at "
        << url << " -- it may be wedged before its HTTP bind; stop that process and relaunch if this persists\n";
    }
    else{
      std::cout << "Aurora is already running -- opening " << url << " instead\n";
    }
    openWebBrowser(url);
    return 0;
  }

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
  // fatal -- the WebUI still needs to bind so Output Connect is reachable.
  // A later failed *reload* is handled the same way; see PipelineHost::reload.
  std::unique_ptr<Aurora::Runtime::Pipeline> initialPipeline;
  std::exception_ptr startupFailure; // held by the host so the WebUI can show it (Aurora-d3ec)
  try{
    initialPipeline = Aurora::Runtime::Pipeline::build(registry, config, configRoot, pipelineOptions());
  }
  catch(const std::exception& e){
    startupFailure = std::current_exception();
    std::cerr << "Pipeline not started (" << e.what() << ") -- WebUI still available for setup\n";
  }
  Aurora::Runtime::PipelineHost pipelineHost(std::move(initialPipeline), pipelineOptions(), startupFailure);

  Aurora::Network::Http::Server::HttpServer httpServer;
  registerCapabilitiesRoute(httpServer, registry, pipelineHost);
  registerVersionRoute(httpServer);
  // Started this early so the permission prompt appears at launch, before
  // the user reaches the Connect screen.
  Aurora::App::LocalNetworkProbe localNetworkProbe;
  registerLocalNetworkRoute(httpServer, localNetworkProbe);

  // Tooltip descriptors: every layer contributes its own control
  // descriptions; the frontend looks them up purely by key.
  Aurora::Runtime::DescriptorRegistry descriptorRegistry;
  descriptorRegistry.add("video", Aurora::Runtime::videoControlDescriptors());
  descriptorRegistry.add("input", Aurora::Input::Mac::macInputControlDescriptors());
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
  descriptorRegistry.add("audio", Aurora::Runtime::audioControlDescriptors());
#endif
  descriptorRegistry.add("zones", Aurora::Runtime::zoneControlDescriptors());
  descriptorRegistry.add("app", Aurora::Runtime::appControlDescriptors());
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
  descriptorRegistry.add("hue", Aurora::Output::Hue::hueControlDescriptors());
#endif
  for(const auto& collision : descriptorRegistry.collisions()){
    std::cerr << "[descriptors] collision on '" << collision.key
              << "': kept '" << collision.keptOwner
              << "', dropped '" << collision.droppedOwner << "'\n";
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
  Aurora::Runtime::registerStateRoute(httpServer, pipelineHost, registry, configRoot);
  Aurora::Runtime::registerDevErrorsRoute(httpServer, pipelineHost);
  registerStopRoute(httpServer);
  Aurora::Runtime::registerZoneRoutes(
    httpServer,
    [&pipelineHost]{ return pipelineHost.listZones(); },
    [&pipelineHost](std::uint8_t zoneId, const auto& uvs, const auto& active, const auto& gamma){
      return pipelineHost.updateZone(zoneId, uvs, active, gamma);
    },
    [&pipelineHost]{ return pipelineHost.isPaused(); }
  );

  // WebUI static files -- must be set before bind() per HttpServer's own
  // contract. AURORA_WEBUI_SOURCE_DIR is baked in at configure time (see
  // CMakeLists.txt); editing WebUI files during dev needs no rebuild; a
  // moved tree without the checkout falls back to the embedded webroot.
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

  // Own thread -- listen() blocks until stop() is called, so it can never
  // share the tick-loop thread below. A bind failure (e.g. port already in
  // use) logs and continues without the WebUI rather than aborting the
  // whole app. HttpServerThread's destructor stops and joins on every exit
  // path below, not just the happy one. Declared after pipelineHost so
  // it's destroyed (and the server stopped) first on the way out.
  std::optional<HttpServerThread> httpServerThread;
  const bool webUiBound = httpServer.bind(config.boundBackendIP(), config.restServerPort());
  std::string url;
  if(webUiBound){
    httpServerThread.emplace(httpServer, std::thread([&httpServer]{ httpServer.listen(); }));
    url = "http://" + browsableAddress(config.boundBackendIP())
      + ":" + std::to_string(config.restServerPort()) + "/";
    if(isFirstSetup){
      std::cout << "WebUI: opening " << url << " in your browser\n";
      openWebBrowser(url);
    }
    else{
      printClickableLink(url);
    }
  }
  else{
    std::cerr << "Could not bind WebUI to " << config.boundBackendIP() << ":" << config.restServerPort()
               << " -- continuing without it\n";
  }

  std::cout << "Aurora running. Ctrl+C to stop.\n";

  // Aurora-qps.2: tray presence (NSStatusItem) from here until scope exit.
  // No LSUIElement yet -- the Dock icon still shows; agent mode is
  // Aurora-qps.3, sequenced separately. See "Tray-parity" in
  // docs/MacSupport.md.
  //
  // Pause/Resume (Aurora-5ipy.14, Aurora-q9l1): the menu callback only posts
  // the clicked target (run/pause, last click wins); the tick thread below
  // performs it, because resume takes seconds (Hue DTLS) and the main thread
  // must keep pumping AppKit. With no pipeline while paused, blocking the
  // tick thread there costs nothing.
  Aurora::Runtime::PendingRunRequest pendingRunRequest;
  Aurora::App::TrayIcon trayIcon(url, webUiBound,
    [&]{ openWebBrowser(url); },
    []{ g_stopRequested = true; },
    [&]{ pendingRunRequest.requestToggle(pipelineHost.isPaused()); },
    [&]{ return pipelineHost.status(); });

  // Drives whichever Pipeline is current at the top of each iteration -- a
  // reload swapping it mid-loop is exactly what PipelineHost's own lock is
  // for; this loop never needs to know a swap happened.
  //
  // Own thread (Aurora-zlw): NSMenu tracking blocks inside trayIcon.pump()
  // for as long as the menu is open, and AppKit requires the main thread for
  // that pump, so the tick loop is what moves. Any exception is captured and
  // rethrown on the main thread, and cancelMenuTracking() on the way out
  // guarantees a stop that didn't come from the menu (/api/stop, SIGINT)
  // can't leave main blocked in a menu the user hasn't dismissed.
  // Host-state row for the banner (Aurora-h457): edges of the grabber's
  // permission flag become an "audio_permission" entry. Polled here because
  // the flag is a timer, not an event, and this thread may take the pipeline
  // lock that the lock-free heartbeat cannot.
  Aurora::App::AudioPermissionPublisher audioPermission(
    [&]{ return audioPermissionLikelyDenied(pipelineHost); },
    [&](const std::string& source, const std::string& message){ return pipelineHost.setError(source, message); },
    [&](const std::string& source){ pipelineHost.removeError(source); }
  );

  std::exception_ptr tickError;
  std::thread tickThread([&]{
    try{
      while(!g_stopRequested){
        if(auto runTarget = pendingRunRequest.take()){
          std::string error;
          if(!pipelineHost.setRunning(*runTarget, registry, configRoot, error)){
            std::cerr << "Tray pause/resume failed: " << error << "\n";
          }
        }
        audioPermission.poll();
        auto tickStart = std::chrono::steady_clock::now();
        pipelineHost.tick();
        auto tickInterval = std::chrono::duration<double>(pipelineHost.tickIntervalSeconds());
        std::this_thread::sleep_until(tickStart + std::chrono::duration_cast<std::chrono::steady_clock::duration>(tickInterval));
      }
    }
    catch(...){
      tickError = std::current_exception();
      g_stopRequested = true;
    }
    trayIcon.cancelMenuTracking();
  });

  // std::thread::~thread() would std::terminate() if this scope unwound
  // (e.g. pump() throwing) with the thread joinable.
  struct TickThreadJoiner
  {
    std::thread& thread;
    ~TickThreadJoiner(){ g_stopRequested = true; if(thread.joinable()){ thread.join(); } }
  } tickThreadJoiner{tickThread};

  // Main thread: AppKit's pump only. The timeout bounds how long a stop
  // request that didn't wake AppKit (SIGINT, /api/stop) waits to be seen.
  while(!g_stopRequested){
    trayIcon.pump(0.1);
  }

  std::cout << "Stopping...\n";
  tickThread.join();
  if(tickError){ std::rethrow_exception(tickError); }
  pipelineHost.shutdown();

  // httpServerThread stops and joins the WebUI in its destructor as this
  // scope unwinds (std::thread::~thread() would std::terminate() otherwise
  // if one of those had left it running unjoined).
  return 0;
}
// Plugin construction (e.g. input selection) can throw -- catch here so
// that's a clean error message, not std::terminate.
catch(const std::exception& e)
{
  std::cerr << "Fatal: " << e.what() << "\n";
  return 1;
}
