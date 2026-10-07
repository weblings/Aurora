// Test-script entry point wiring one Linux input to one or more outputs
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
#include <chrono>
#include <atomic>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <optional>
#include <thread>

#include <nlohmann/json.hpp>

#include <Aurora/App/Cli.hpp>
#include <Aurora/App/FakeHue.hpp>
#include <Aurora/App/InstanceLock.hpp>
#include <Aurora/App/InstanceLock.hpp>
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

#include <Aurora/Input/Linux/AudioSinkStatus.hpp>
#include <Aurora/Input/Linux/DummyGrabber.hpp>
#include <Aurora/Input/Linux/InputControlDescriptors.hpp>
#include <Aurora/Input/Linux/SessionDispatch.hpp>
#ifdef AURORA_INPUT_LINUX_X11_AVAILABLE
#include <Aurora/Input/Linux/X11Grabber.hpp>
#endif
#ifdef AURORA_INPUT_LINUX_PIPEWIRE_AVAILABLE
#include <Aurora/Input/Linux/PipewireGrabber.hpp>
#endif
#ifdef AURORA_INPUT_LINUX_AUDIO_AVAILABLE
#include <Aurora/Input/Linux/AudioGrabber.hpp>
#include <Aurora/Input/Linux/AudioSinkList.hpp>
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
  volatile std::sig_atomic_t g_stopRequested = 0;

  void handleStopSignal(int)
  {
    g_stopRequested = 1;
  }


  // "linux" auto-selects X11 vs. Wayland/Pipewire the way huenicorn's
  // GnuLinuxAdapter did; the concrete backend names are also registered
  // individually for manual override while testing.
  void registerInputs(Aurora::Runtime::Registry& registry)
  {
    registry.registerInput("dummy", []{
      return std::make_unique<Aurora::Input::Linux::DummyGrabber>();
    });

    bool x11Available = false;
    bool pipewireAvailable = false;

#ifdef AURORA_INPUT_LINUX_X11_AVAILABLE
    x11Available = true;
    registry.registerInput("x11", []{
      return std::make_unique<Aurora::Input::Linux::X11Grabber>();
    });
#endif

#ifdef AURORA_INPUT_LINUX_PIPEWIRE_AVAILABLE
    pipewireAvailable = true;
    registry.registerInput("pipewire", []{
      return std::make_unique<Aurora::Input::Linux::PipewireGrabber>();
    });
#endif

    registry.registerInput("linux", [x11Available, pipewireAvailable]() -> std::unique_ptr<Aurora::Input::IVideoInput> {
      using namespace Aurora::Input::Linux;

      switch(selectBackendFromEnvironment(pipewireAvailable, x11Available)){
#ifdef AURORA_INPUT_LINUX_X11_AVAILABLE
        case Backend::X11:
          return std::make_unique<X11Grabber>();
#endif
#ifdef AURORA_INPUT_LINUX_PIPEWIRE_AVAILABLE
        case Backend::WaylandPipewire:
          return std::make_unique<PipewireGrabber>();
        case Backend::GamescopePipewire:
          return std::make_unique<PipewireGrabber>(/*useGamescope*/ true);
#endif
        default:
          throw std::runtime_error("No capture backend available for this session -- falling back to 'dummy' input is an explicit choice, not automatic");
      }
    });
  }


  void registerAudioInputs(Aurora::Runtime::Registry& registry, const std::filesystem::path& configRoot)
  {
#ifdef AURORA_INPUT_LINUX_AUDIO_AVAILABLE
    // Loads Config fresh on every factory call (each Pipeline::build, i.e.
    // each reload) -- capturing targetSinkName at registration time would
    // go stale after any PUT that changes it, since reload() never
    // re-registers (Aurora-4vf: the sink field's own edits wouldn't apply
    // live). Empty targetSinkName means AudioGrabber resolves the default
    // sink itself; see Config::audioTargetSinkName.
    registry.registerAudioInput("linux-audio", [configRoot]{
      return std::make_unique<Aurora::Input::Linux::AudioGrabber>(
        Aurora::Runtime::ConfigStore(configRoot).load().audioTargetSinkName()
      );
    });
#else
    (void)registry;
    (void)configRoot;
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


  // --fresh: rehearse first-run flows (NUX, pairing) against a
  // guaranteed-empty config root. A fixed temp dir, cleared at startup, so
  // repeated runs can never re-soil each other and real config dirs are
  // never read or written. Wins over AURORA_CONFIG_DIR and the default.
  bool isFreshRun(int argc, char** argv)
  {
    return Aurora::App::hasCliFlag(argc, argv, "--fresh");
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

    const char* home = std::getenv("HOME");
    if(!home){
      throw std::runtime_error("Neither AURORA_CONFIG_DIR nor HOME is set");
    }

    return std::filesystem::path(home) / ".config" / "aurora";
  }


  // "0.0.0.0" is what a socket binds to, not something a browser can
  // navigate to -- browsers vary in whether/how they alias it, so surface
  // loopback instead. A real bound-to-a-LAN-IP config still prints as-is.
  std::string browsableAddress(const std::string& boundBackendIP)
  {
    return boundBackendIP == "0.0.0.0" ? "127.0.0.1" : boundBackendIP;
  }


  // Best-effort -- a failure here shouldn't stop the app, the printed URL
  // above is still there as a fallback. xdg-open is the desktop-agnostic
  // standard huenicorn's own LinuxAdapter uses for the same purpose.
  void openWebBrowser(const std::string& url)
  {
    std::system(("xdg-open '" + url + "' >/dev/null 2>&1 &").c_str());
  }


  // OSC 8 terminal hyperlink -- most Linux terminal emulators already
  // support this with no extra setup, unlike Windows conhost.
  void printClickableLink(const std::string& url)
  {
    std::cout << "WebUI: \033]8;;" << url << "\033\\" << url << "\033]8;;\033\\\n";
  }


  // Linux's per-app pieces of the shared Pipeline (core/Runtime, Aurora-9ig).
  // Logging stays on the default stdout/stderr split.
  Aurora::Runtime::PipelineOptions pipelineOptions()
  {
    Aurora::Runtime::PipelineOptions options;
    options.noAudioSupportMessage =
      "activeAudioInputName is set, but this build has no audio support "
      "(AURORA_CORE_ENABLE_AUDIO/AURORA_APP_ENABLE_LINUX_AUDIO_INPUT were off)";
#ifdef AURORA_INPUT_LINUX_AUDIO_AVAILABLE
    // Backs the WebUI's audio-device dropdown (Aurora-kea replaced its
    // 'linux-audio' gate with this). Without audio there's nothing to pick.
    options.audioDevicesUrl = "/api/linux/audio-sinks";
#endif
    return options;
  }


  // Linux audio's "which sink" report (Aurora-4vf): unknown unless a live
  // audio pipeline holds this build's own AudioGrabber -- video mode, no
  // pipeline, or a foreign audio input all report empty, not an error
  // (same precedent as /api/monitors). Deliberately Linux-specific, not
  // on IAudioInput -- dynamic_cast, the same shape Mac's own
  // audioPermissionLikelyDenied() uses for its platform query.
  Aurora::Input::Linux::AudioSinkStatus audioSinkStatus(Aurora::Runtime::PipelineHost& pipelineHost)
  {
#ifdef AURORA_INPUT_LINUX_AUDIO_AVAILABLE
    return pipelineHost.withAudioInput([](Aurora::Input::IAudioInput* input){
      auto* audio = dynamic_cast<Aurora::Input::Linux::AudioGrabber*>(input);
      return audio ? audio->sinkStatus() : Aurora::Input::Linux::AudioSinkStatus{};
    });
#else
    (void)pipelineHost;
    return {};
#endif
  }


  // Linux-only (registered unconditionally, but reports unknown off
  // linux-audio mode -- see audioSinkStatus() above). A separate route
  // rather than a new /api/capabilities field on purpose: that route's
  // heartbeat is deliberately lock-free, and this takes the pipeline lock
  // (same split Mac's /api/mac/audio-status already uses). The WebUI polls
  // this only while genuinely in audio mode, not on the heartbeat cadence.
  void registerAudioStatusRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer,
    Aurora::Runtime::PipelineHost& pipelineHost
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/linux/audio-status",
      [&pipelineHost](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        auto status = audioSinkStatus(pipelineHost);

        res.contentType = "application/json";
        res.body = nlohmann::json{
          {"followingDefault", status.followingDefault},
          {"sinkName", status.sinkName}
        }.dump();
      }
    );
  }


  // Linux-only sibling of /api/linux/audio-status (Aurora-67y): the live
  // PipeWire Audio/Sink list backing the DeviceField audio dropdown.
  // Unlike audio-status this takes no pipeline lock -- enumeration opens
  // its own short-lived PipeWire connection, independent of whatever
  // pipeline (if any) is running, so it works in any mode. Without audio
  // support compiled in it reports an empty list, and the WebUI falls
  // back to its System-default-only dropdown.
  void registerAudioSinksRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/linux/audio-sinks",
      [](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        nlohmann::json list = nlohmann::json::array();
#ifdef AURORA_INPUT_LINUX_AUDIO_AVAILABLE
        for(const auto& sink : Aurora::Input::Linux::enumerateAudioSinks()){
          list.push_back({
            {"name", sink.name},
            {"description", sink.description}
          });
        }
#endif
        res.contentType = "application/json";
        res.body = nlohmann::json{{"sinks", list}}.dump();
      }
    );
  }


  // Sets the same flag SIGINT/SIGTERM already sets (the signal handler,
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
        g_stopRequested = 1;
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
          // Literal per app binary, not runtime-detected -- each of
          // app/linux, app/windows, app/mac is already its own platform-
          // specific translation unit. Lets the WebUI show platform-
          // specific messaging (e.g. Mac's Screen Recording permission
          // recovery flow, Aurora-8mk.8) without guessing from other signals.
          {"platform", "linux"},
          // In-memory pause (Aurora-3ddb); read lock-free like the rest.
          {"paused", pipelineHost.isPaused()}
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
  // healthy handoff. The browser still opens either way -- with the UI's
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

  // Loaded before registration (unlike Aurora-App-Windows) -- the initial
  // Pipeline::build() below needs it. The audio factory loads Config fresh
  // per build instead (see registerAudioInputs), since Registry's
  // factories are zero-arg closures that reload() never re-registers.
  Aurora::Runtime::Registry registry;
  registerInputs(registry);
  registerAudioInputs(registry, configRoot);
  registerOutputs(registry, configRoot);

  // Built before any route is registered below -- the settings/reload routes
  // capture pipelineHost by reference, so it has to exist first. A failure
  // here (e.g. a fresh install with no output paired yet) is no longer
  // fatal -- the WebUI still needs to bind so Output Connect is reachable;
  // see WebUI/WebUI_Fixes.md's "HTTP server never binds" task. A later
  // failed *reload* is handled the same way; see PipelineHost::reload.
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

  // Tooltip descriptors (docs/TooltipsAnalysis.md): every layer
  // contributes its own control descriptions; the frontend looks them
  // up purely by key.
  Aurora::Runtime::DescriptorRegistry descriptorRegistry;
  descriptorRegistry.add("video", Aurora::Runtime::videoControlDescriptors());
  descriptorRegistry.add("input", Aurora::Input::Linux::linuxInputControlDescriptors());
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
  registerAudioStatusRoute(httpServer, pipelineHost);
  registerAudioSinksRoute(httpServer);
  Aurora::Runtime::registerReloadRoute(httpServer, pipelineHost, registry, configRoot);
  Aurora::Runtime::registerStateRoute(httpServer, pipelineHost, registry, configRoot);
  registerStopRoute(httpServer);
  Aurora::Runtime::registerZoneRoutes(
    httpServer,
    [&pipelineHost]{ return pipelineHost.listZones(); },
    [&pipelineHost](std::uint8_t zoneId, const auto& uvs, const auto& active, const auto& gamma){
      return pipelineHost.updateZone(zoneId, uvs, active, gamma);
    },
    [&pipelineHost]{ return pipelineHost.isPaused(); }
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

  // Aurora-lx4.2: tray presence (SNI) from here until scope exit.
  // Best-effort: with no session bus or watcher there is simply no
  // icon, and the WebUI print above remains the fallback.
  // Pause/Resume (Aurora-5ipy.16, Aurora-q9l1): the tray callback only posts
  // the clicked target (run/pause, last click wins); the tick loop below
  // performs it, because resume takes seconds (Hue DTLS, portal dialog) and
  // the D-Bus worker must stay responsive. With no pipeline while paused,
  // blocking the loop here costs nothing.
  Aurora::Runtime::PendingRunRequest pendingRunRequest;
  Aurora::App::TrayIcon trayIcon(url, webUiBound,
    [&]{ openWebBrowser(url); },
    []{ g_stopRequested = 1; },
    [&]{ pendingRunRequest.requestToggle(pipelineHost.isPaused()); },
    [&]{ return pipelineHost.isPaused(); });
  bool trayShowsPaused = pipelineHost.isPaused();

  // Drives whichever Pipeline is current at the top of each iteration -- a
  // reload swapping it mid-loop is exactly what PipelineHost's own lock is
  // for; this loop never needs to know a swap happened.
  while(!g_stopRequested){
    if(auto runTarget = pendingRunRequest.take()){
      std::string error;
      if(!pipelineHost.setRunning(*runTarget, registry, configRoot, error)){
        std::cerr << "Tray pause/resume failed: " << error << "\n";
      }
    }
    if(pipelineHost.isPaused() != trayShowsPaused){
      trayShowsPaused = pipelineHost.isPaused();
      trayIcon.refresh();
    }
    auto tickStart = std::chrono::steady_clock::now();
    pipelineHost.tick();
    auto tickInterval = std::chrono::duration<double>(pipelineHost.tickIntervalSeconds());
    std::this_thread::sleep_until(tickStart + std::chrono::duration_cast<std::chrono::steady_clock::duration>(tickInterval));
  }

  std::cout << "Stopping...\n";
  pipelineHost.shutdown();

  // httpServerThread stops and joins the WebUI in its destructor as this
  // scope unwinds -- after this point, same order huenicorn's own
  // Runtime::_startStreamingLoop uses, and on every early return above too
  // (std::thread::~thread() would std::terminate() otherwise if one of
  // those had left it running unjoined).
  return 0;
}
// Plugin construction (e.g. "linux" input selection) can throw --
// catch here so that's a clean error message, not std::terminate.
catch(const std::exception& e)
{
  std::cerr << "Fatal: " << e.what() << "\n";
  return 1;
}
