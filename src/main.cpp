// Test-script entry point wiring one Linux input to one or more outputs
// through Orchestrator. Not yet a real product app -- bridge credentials
// still come from env vars, not a persisted pairing flow (see
// Analysis/ImplementationPlan.md phase 3). Zone maps now have a real REST
// surface (registerZoneRoutes, below, build-order step 14) even though the
// WebUI's own Zone Mapping screen consuming it is still a later step (15) --
// this comment used to claim no zone-mapping UI existed at any layer, which
// is no longer accurate for the backend half. See
// Analysis/DistributedArchitecturePlan.md for how this shape is expected to
// evolve further.

#include <chrono>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <optional>
#include <thread>

#include <nlohmann/json.hpp>

#include <Aurora/App/Registry.hpp>
#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Orchestrator.hpp>
#include <Aurora/Runtime/SettingsRoutes.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>
#include <Aurora/Runtime/ZoneRoutes.hpp>
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
#include <Aurora/Runtime/AudioOrchestrator.hpp>
#endif

#include <Aurora/Input/Linux/DummyGrabber.hpp>
#include <Aurora/Input/Linux/SessionDispatch.hpp>
#ifdef AURORA_INPUT_LINUX_X11_AVAILABLE
#include <Aurora/Input/Linux/X11Grabber.hpp>
#endif
#ifdef AURORA_INPUT_LINUX_PIPEWIRE_AVAILABLE
#include <Aurora/Input/Linux/PipewireGrabber.hpp>
#endif
#ifdef AURORA_INPUT_LINUX_AUDIO_AVAILABLE
#include <Aurora/Input/Linux/AudioGrabber.hpp>
#endif

#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
#include <Aurora/Output/Hue/Credentials.hpp>
#include <Aurora/Output/Hue/CredentialsStore.hpp>
#include <Aurora/Output/Hue/HueOutput.hpp>
#include <Aurora/Output/Hue/PairingRoutes.hpp>
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
  void registerInputs(Aurora::App::Registry& registry)
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


  void registerAudioInputs(Aurora::App::Registry& registry, const Aurora::Runtime::Config& config)
  {
#ifdef AURORA_INPUT_LINUX_AUDIO_AVAILABLE
    // Captured by value at registration time -- Config is loaded before
    // this runs (see main()), unlike registerInputs/registerOutputs above
    // which don't need it. Empty targetSinkName means AudioGrabber resolves
    // the default sink itself; see Config::audioTargetSinkName.
    registry.registerAudioInput("linux-audio", [targetSinkName = config.audioTargetSinkName()]{
      return std::make_unique<Aurora::Input::Linux::AudioGrabber>(targetSinkName);
    });
#else
    (void)registry;
    (void)config;
#endif
  }


  // Hue only gets registered if credentials are actually present -- no
  // pairing flow exists yet, so an unconfigured Hue output shouldn't be
  // selectable at all rather than failing confusingly at construction.
  // CredentialsStore (Analysis/WebUIAnalysis.md's build-order step 4) is
  // checked first; env vars are a dev-only fallback for setups that
  // haven't paired through it yet, not a second, equally-valid source --
  // a persisted connection always wins over env vars when both are set.
  void registerOutputs(Aurora::App::Registry& registry, const std::filesystem::path& configRoot)
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
    else{
      std::cerr << "No Hue credentials persisted and "
                   "AURORA_HUE_BRIDGE_ADDRESS/AURORA_HUE_USERNAME/AURORA_HUE_CLIENTKEY not all set "
                   "-- 'hue' output unavailable this run (no pairing flow exists yet)\n";
    }
#else
    (void)registry;
    (void)configRoot;
#endif
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


  // The swappable unit a live reload tears down and reconstructs -- the
  // "reconstruction, not mutation" design fork from huenicorn recommended in
  // Analysis/HttpServerAnalysis.md. Lives here (not core::Runtime) because
  // building one needs Registry and this app's own input-name/ifdef
  // dispatch, both app-layer concepts. See Analysis/WebUIAnalysis.md's
  // build-order step 11.
  class Pipeline
  {
  public:
    // Throws on any unrecoverable failure (unknown input/output name, no
    // outputs available) -- caller decides whether that's fatal (first
    // startup) or recoverable (a later reload, old pipeline stays running).
    static std::unique_ptr<Pipeline> build(
      Aurora::App::Registry& registry,
      const Aurora::Runtime::Config& config,
      const std::filesystem::path& configRoot
    )
    {
      auto pipeline = std::unique_ptr<Pipeline>(new Pipeline());

      std::vector<std::string> outputNames = config.activeOutputNames();
      if(outputNames.empty()){
        outputNames = registry.outputNames(); // no explicit selection -- run everything available
      }

      for(const auto& name : outputNames){
        auto output = registry.createOutput(name);
        if(!output){
          std::cerr << "Unknown output '" << name << "', skipping\n";
          continue;
        }
        output->init();
        pipeline->m_outputPtrs.push_back(output.get());
        pipeline->m_outputs.push_back(std::move(output));
      }

      if(pipeline->m_outputPtrs.empty()){
        throw std::runtime_error("No outputs available -- nothing to drive");
      }

      // Video wins if both could apply -- explicit opt-in to audio requires
      // leaving activeInputName unset. Same rule main() always used.
      bool useAudioMode = config.activeInputName().empty() && !config.activeAudioInputName().empty();

      if(useAudioMode){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
        auto audioInput = registry.createAudioInput(config.activeAudioInputName());
        if(!audioInput){
          throw std::runtime_error("Unknown audio input '" + config.activeAudioInputName() + "'");
        }

        Aurora::Processing::AudioProcessing::AudioEffectSettings settings;
        if(config.audioFixedAnchorHue() >= 0.f){
          settings.fixedAnchorHue = config.audioFixedAnchorHue();
        }
        settings.bounceSmoothTime = config.audioBounceSmoothTime();
        settings.dynamismFloor = config.audioDynamismFloor();
        settings.centroidStrength = config.audioCentroidStrength();
        settings.driftBaseRateDegPerSec = config.audioDriftBaseRateDegPerSec();
        settings.vibrancySaturation = config.audioVibrancySaturation();
        settings.vibrancyValue = config.audioVibrancyValue();
        settings.referenceRms = config.audioReferenceRms();
        settings.brightnessFloor = config.audioBrightnessFloor();
        settings.centroidRangeHz = config.audioCentroidRangeHz();
        settings.brightnessSmoothTime = config.audioBrightnessSmoothTime();

        pipeline->m_audioOrchestrator.emplace(
          *audioInput, pipeline->m_outputPtrs, Aurora::Runtime::ZoneMapStore(configRoot), settings
        );
        pipeline->m_audioOrchestrator->init();
        pipeline->m_audioInput = std::move(audioInput);
        pipeline->m_isAudioMode = true;
        pipeline->m_tickIntervalSeconds = 1.0 / 60.0; // no display-derived rate for audio

        std::cout << "Aurora running: audio input='" << config.activeAudioInputName()
                   << "', " << pipeline->m_outputPtrs.size() << " output(s).\n";
#else
        throw std::runtime_error(
          "activeAudioInputName is set, but this build has no audio support "
          "(AURORA_CORE_ENABLE_AUDIO/AURORA_APP_ENABLE_LINUX_AUDIO_INPUT were off)"
        );
#endif
      }
      else{
        std::string inputName = config.activeInputName().empty() ? "linux" : config.activeInputName();
        auto input = registry.createInput(inputName);
        if(!input){
          throw std::runtime_error("Unknown input '" + inputName + "'");
        }
        input->init();

        pipeline->m_orchestrator.emplace(
          *input, pipeline->m_outputPtrs, config, Aurora::Runtime::ZoneMapStore(configRoot)
        );
        pipeline->m_orchestrator->init();
        pipeline->m_videoInput = std::move(input);
        pipeline->m_isAudioMode = false;
        pipeline->m_tickIntervalSeconds = 1.0 / pipeline->m_orchestrator->config().refreshRate();

        // Persists any refreshRate/subsampleWidth just derived from the
        // display -- same as main() always did right after construction.
        Aurora::Runtime::ConfigStore(configRoot).save(pipeline->m_orchestrator->config());

        std::cout << "Aurora running: input='" << inputName
                   << "', " << pipeline->m_outputPtrs.size() << " output(s).\n";
      }

      return pipeline;
    }

    void tick()
    {
      if(m_isAudioMode){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
        m_audioOrchestrator->update(static_cast<float>(m_tickIntervalSeconds));
#endif
      }
      else{
        m_orchestrator->update();
      }
    }

    double tickIntervalSeconds() const
    {
      return m_tickIntervalSeconds;
    }

    // Empty in audio mode -- no monitor concept applies then, not an error.
    Aurora::Input::Monitors listMonitors() const
    {
      return m_videoInput ? m_videoInput->monitors() : Aurora::Input::Monitors{};
    }

    // Empty in audio mode or with no outputs -- same "nothing to report,
    // not an error" precedent as listMonitors(). Only the first output is
    // considered: today's only real output is Hue, and the WebUI's own
    // Zone Mapping screen is designed around one unified zone grid, not
    // per-output tabs -- a documented v1 scope limit, not an oversight.
    Aurora::Runtime::ZoneListResult listZones() const
    {
      if(m_isAudioMode || m_outputPtrs.empty()){
        return {};
      }

      const std::string& name = m_outputPtrs.front()->name();
      return {name, m_orchestrator->zoneMap(name)};
    }

    bool updateZone(
      std::uint8_t zoneId,
      const std::optional<Aurora::Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    )
    {
      if(m_isAudioMode || m_outputPtrs.empty()){
        return false;
      }

      return m_orchestrator->updateZone(m_outputPtrs.front()->name(), zoneId, uvs, active, gamma);
    }

    void shutdown(bool isReplacement)
    {
      for(auto* output : m_outputPtrs){
        output->shutdown(isReplacement);
      }
    }

  private:
    Pipeline() = default;

    bool m_isAudioMode{false};
    double m_tickIntervalSeconds{1.0 / 60.0};

    // Declaration order matters: m_orchestrator/m_audioOrchestrator hold a
    // reference into m_videoInput/m_audioInput, so those must be declared
    // (and therefore destroyed after, since destruction runs in reverse
    // declaration order) first -- same reasoning already applied to
    // EntertainmentConfigurationSelector's own member order in
    // Aurora-Output-Hue.
    std::unique_ptr<Aurora::Input::IVideoInput> m_videoInput;
    std::unique_ptr<Aurora::Input::IAudioInput> m_audioInput;
    std::vector<std::unique_ptr<Aurora::Output::IOutput>> m_outputs;
    std::vector<Aurora::Output::IOutput*> m_outputPtrs;
    std::optional<Aurora::Runtime::Orchestrator> m_orchestrator;
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    std::optional<Aurora::Runtime::AudioOrchestrator> m_audioOrchestrator;
#endif
  };


  // One consistent lock around the swappable Pipeline -- the design
  // HttpServerAnalysis.md recommended over huenicorn's own narrower
  // single-mutex approach, since Aurora reconstructs the whole pipeline
  // rather than mutating pieces of a live one. tick() (main thread) and
  // reload() (the HTTP server's thread, via a settings PUT or /api/reload)
  // both take the same lock; reload() builds the replacement *before*
  // acquiring it, so a slow or failing build never blocks a tick in
  // progress, and the old pipeline's shutdown() runs only after the swap,
  // once no tick() call can reach it anymore.
  class PipelineHost
  {
  public:
    explicit PipelineHost(std::unique_ptr<Pipeline> initial):
    m_pipeline(std::move(initial))
    {
    }

    void tick()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      m_pipeline->tick();
    }

    double tickIntervalSeconds()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_pipeline->tickIntervalSeconds();
    }

    Aurora::Input::Monitors listMonitors()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_pipeline->listMonitors();
    }

    // Same lock as tick() -- a zone edit and an in-progress tick must never
    // interleave, but unlike reload(), this never swaps or rebuilds the
    // Pipeline at all, so it's cheap enough to call on every drag-frame a
    // real Zone Mapping UI sends, not just on a final "Save".
    Aurora::Runtime::ZoneListResult listZones()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_pipeline->listZones();
    }

    bool updateZone(
      std::uint8_t zoneId,
      const std::optional<Aurora::Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    )
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_pipeline->updateZone(zoneId, uvs, active, gamma);
    }

    // Returns true on success. On failure, errorOut is set and the previous
    // pipeline keeps running untouched -- a bad reload (e.g. an
    // activeInputName a settings PUT just wrote that doesn't resolve to any
    // registered input) must not take down an already-working pipeline.
    bool reload(
      Aurora::App::Registry& registry,
      const Aurora::Runtime::Config& config,
      const std::filesystem::path& configRoot,
      std::string& errorOut
    )
    {
      std::unique_ptr<Pipeline> next;
      try{
        next = Pipeline::build(registry, config, configRoot);
      }
      catch(const std::exception& e){
        errorOut = e.what();
        return false;
      }

      std::unique_ptr<Pipeline> previous;
      {
        std::lock_guard<std::mutex> lock(m_mutex);
        previous = std::move(m_pipeline);
        m_pipeline = std::move(next);
      }
      previous->shutdown(/*isReplacement*/ true);
      return true;
    }

    void shutdown()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      m_pipeline->shutdown(/*isReplacement*/ false);
    }

  private:
    std::mutex m_mutex;
    std::unique_ptr<Pipeline> m_pipeline;
  };


  void registerMonitorsRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer,
    PipelineHost& pipelineHost
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/monitors",
      [&pipelineHost](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        auto monitors = pipelineHost.listMonitors();

        nlohmann::json list = nlohmann::json::array();
        for(size_t i = 0; i < monitors.size(); ++i){
          const auto& monitor = monitors[i];
          list.push_back({
            {"id", i},
            {"name", monitor->name},
            {"width", monitor->width},
            {"height", monitor->height},
            {"refreshRate", monitor->refreshRate},
            {"isPrimary", monitor->isPrimary}
          });
        }

        res.contentType = "application/json";
        res.body = nlohmann::json{{"monitors", list}}.dump();
      }
    );
  }


  // Manual escape hatch alongside PUT /api/config's automatic funnel-through
  // (e.g. "re-scan" after plugging in a monitor, with no field actually
  // changed).
  void registerReloadRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer,
    PipelineHost& pipelineHost,
    Aurora::App::Registry& registry,
    const std::filesystem::path& configRoot
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Post,
      "/api/reload",
      [&pipelineHost, &registry, configRoot](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        Aurora::Runtime::Config config = Aurora::Runtime::ConfigStore(configRoot).load();
        std::string error;
        res.contentType = "application/json";
        if(pipelineHost.reload(registry, config, configRoot, error)){
          res.body = nlohmann::json{{"succeeded", true}}.dump();
        }
        else{
          res.status = 500;
          res.body = nlohmann::json{{"succeeded", false}, {"error", error}}.dump();
        }
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
  // that assumes one exists (Analysis/WebUIAnalysis.md's capability-probe
  // step). No Config dependency, so this can be registered before Config
  // loads -- addRoute() just captures it for bind() to hand to Impl later.
  void registerCapabilitiesRoute(
    Aurora::Network::Http::Server::HttpServer& httpServer,
    const Aurora::App::Registry& registry
  )
  {
    httpServer.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/capabilities",
      [&registry](const Aurora::Network::Http::Server::Request&, Aurora::Network::Http::Server::Response& res){
        nlohmann::json json = {
          {"inputs", registry.inputNames()},
          {"audioInputs", registry.audioInputNames()},
          {"outputs", registry.outputNames()}
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


int main()
try
{
  std::signal(SIGINT, handleStopSignal);
  std::signal(SIGTERM, handleStopSignal);

  auto configRoot = resolveConfigRoot();

  // Captured before ConfigStore/Pipeline ever touch this configRoot --
  // Pipeline::build() unconditionally re-saves config.json on every launch
  // (see its refreshRate/subsampleWidth persist), so this must be read
  // before that or it would always see the file as already existing.
  bool isFirstSetup = !std::filesystem::exists(configRoot / "config.json");

  Aurora::Runtime::ConfigStore configStore(configRoot);
  Aurora::Runtime::Config config = configStore.load();

  // Loaded before registration (unlike Aurora-App-Windows) -- Linux's audio
  // input needs Config::audioTargetSinkName at registration time, since
  // Registry's factories are zero-arg closures.
  Aurora::App::Registry registry;
  registerInputs(registry);
  registerAudioInputs(registry, config);
  registerOutputs(registry, configRoot);

  // Built before any route is registered below -- the settings/reload routes
  // capture pipelineHost by reference, so it has to exist first. A failure
  // here (unknown input/output name) is fatal at startup, same as main()
  // always treated it -- caught by this function's own outer catch. A later
  // failed *reload* (a bad value a settings PUT just wrote) is recoverable
  // instead; see PipelineHost::reload.
  PipelineHost pipelineHost(Pipeline::build(registry, config, configRoot));

  Aurora::Network::Http::Server::HttpServer httpServer;
  registerCapabilitiesRoute(httpServer, registry);
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
  Aurora::Output::Hue::registerPairingRoutes(httpServer, configRoot,
    [&pipelineHost, &registry, configRoot]() -> std::string {
      Aurora::Runtime::Config freshConfig = Aurora::Runtime::ConfigStore(configRoot).load();
      std::string error;
      pipelineHost.reload(registry, freshConfig, configRoot, error);
      return error;
    }
  );
#endif
  // "Every settings PUT funnels into the reload entrypoint" -- re-loads
  // Config fresh (reflecting whatever the PUT that triggered this just
  // saved) rather than closing over the request's own already-stale copy.
  Aurora::Runtime::registerSettingsRoutes(httpServer, configRoot,
    [&pipelineHost, &registry, configRoot]() -> std::string {
      Aurora::Runtime::Config freshConfig = Aurora::Runtime::ConfigStore(configRoot).load();
      std::string error;
      pipelineHost.reload(registry, freshConfig, configRoot, error);
      return error;
    }
  );
  registerMonitorsRoute(httpServer, pipelineHost);
  registerReloadRoute(httpServer, pipelineHost, registry, configRoot);
  registerStopRoute(httpServer);
  Aurora::Runtime::registerZoneRoutes(
    httpServer,
    [&pipelineHost]{ return pipelineHost.listZones(); },
    [&pipelineHost](std::uint8_t zoneId, const auto& uvs, const auto& active, const auto& gamma){
      return pipelineHost.updateZone(zoneId, uvs, active, gamma);
    }
  );

  // Aurora-WebUI's fetched sibling checkout -- must be called before bind()
  // per HttpServer's own contract. AURORA_WEBUI_SOURCE_DIR is baked in at
  // configure time (see CMakeLists.txt); editing WebUI files during dev needs
  // no rebuild since it points straight at the sibling checkout on disk.
  httpServer.serveStaticFiles(AURORA_WEBUI_SOURCE_DIR);

  // Own thread, same as huenicorn's real Runtime::_initWebUI (see
  // Analysis/HttpServerAnalysis.md) -- listen() blocks until stop() is
  // called, so it can never share the tick-loop thread below. A bind
  // failure (e.g. port already in use) logs and continues without the
  // WebUI rather than aborting the whole app. HttpServerThread's destructor
  // stops and joins on every exit path below, not just the happy one.
  // Declared after pipelineHost so it's destroyed (and the server stopped)
  // first on the way out -- same order as the explicit calls below.
  std::optional<HttpServerThread> httpServerThread;
  if(httpServer.bind(config.boundBackendIP(), config.restServerPort())){
    httpServerThread.emplace(httpServer, std::thread([&httpServer]{ httpServer.listen(); }));
    std::string url = "http://" + browsableAddress(config.boundBackendIP())
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

  // Drives whichever Pipeline is current at the top of each iteration -- a
  // reload swapping it mid-loop is exactly what PipelineHost's own lock is
  // for; this loop never needs to know a swap happened.
  while(!g_stopRequested){
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
