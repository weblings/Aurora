// Test-script entry point wiring one Linux input to one or more outputs
// through Orchestrator. Not yet a real product app -- no pairing flow or
// zone-mapping UI exist (see Analysis/ImplementationPlan.md phase 3), so
// bridge credentials and zone maps are stopgaps: env vars and hand-edited
// profile JSON, respectively. See Analysis/DistributedArchitecturePlan.md
// for how this shape is expected to evolve.

#include <chrono>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <thread>

#include <Aurora/App/Registry.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Orchestrator.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>
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
#include <Aurora/Output/Hue/HueOutput.hpp>
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
  void registerOutputs(Aurora::App::Registry& registry)
  {
#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
    const char* bridgeAddress = std::getenv("AURORA_HUE_BRIDGE_ADDRESS");
    const char* username = std::getenv("AURORA_HUE_USERNAME");
    const char* clientkey = std::getenv("AURORA_HUE_CLIENTKEY");
    // Optional: disambiguates when the bridge has >1 entertainment config --
    // HueOutput's empty-ID default (unordered_map::begin()) is arbitrary then.
    const char* entertainmentConfigId = std::getenv("AURORA_HUE_ENTERTAINMENT_CONFIG_ID");

    if(bridgeAddress && username && clientkey){
      registry.registerOutput("hue", [
        bridgeAddress = std::string(bridgeAddress),
        username = std::string(username),
        clientkey = std::string(clientkey),
        entertainmentConfigId = std::string(entertainmentConfigId ? entertainmentConfigId : "")
      ]{
        return std::make_unique<Aurora::Output::Hue::HueOutput>(
          Aurora::Output::Hue::Credentials(username, clientkey),
          bridgeAddress,
          entertainmentConfigId
        );
      });
    }
    else{
      std::cerr << "AURORA_HUE_BRIDGE_ADDRESS/AURORA_HUE_USERNAME/AURORA_HUE_CLIENTKEY not all set "
                   "-- 'hue' output unavailable this run (no pairing flow exists yet)\n";
    }
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
}


int main()
try
{
  std::signal(SIGINT, handleStopSignal);
  std::signal(SIGTERM, handleStopSignal);

  auto configRoot = resolveConfigRoot();
  Aurora::Runtime::ConfigStore configStore(configRoot);
  Aurora::Runtime::Config config = configStore.load();

  // Loaded before registration (unlike Aurora-App-Windows) -- Linux's audio
  // input needs Config::audioTargetSinkName at registration time, since
  // Registry's factories are zero-arg closures.
  Aurora::App::Registry registry;
  registerInputs(registry);
  registerAudioInputs(registry, config);
  registerOutputs(registry);

  // Video wins if both could apply -- explicit opt-in to audio requires
  // leaving activeInputName unset. Same precedence rule as Aurora-App-Windows.
  bool useAudioMode = config.activeInputName().empty() && !config.activeAudioInputName().empty();

  std::vector<std::string> outputNames = config.activeOutputNames();
  if(outputNames.empty()){
    outputNames = registry.outputNames(); // no explicit selection -- run everything available
  }

  std::vector<std::unique_ptr<Aurora::Output::IOutput>> outputs;
  std::vector<Aurora::Output::IOutput*> outputPtrs;
  for(const auto& name : outputNames){
    auto output = registry.createOutput(name);
    if(!output){
      std::cerr << "Unknown output '" << name << "', skipping\n";
      continue;
    }
    output->init();
    outputPtrs.push_back(output.get());
    outputs.push_back(std::move(output));
  }

  if(outputPtrs.empty()){
    std::cerr << "No outputs available -- nothing to drive. Available: ";
    for(const auto& name : registry.outputNames()){ std::cerr << name << " "; }
    std::cerr << "\n";
    return 1;
  }

  if(useAudioMode){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    auto audioInput = registry.createAudioInput(config.activeAudioInputName());
    if(!audioInput){
      std::cerr << "Unknown audio input '" << config.activeAudioInputName() << "'. Available: ";
      for(const auto& name : registry.audioInputNames()){ std::cerr << name << " "; }
      std::cerr << "\n";
      return 1;
    }

    // Built from Config, not hardcoded -- editing config.json changes these
    // without a rebuild. audioFixedAnchorHue < 0 means unset/random.
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

    Aurora::Runtime::AudioOrchestrator orchestrator(
      *audioInput, outputPtrs, Aurora::Runtime::ZoneMapStore(configRoot), settings
    );
    orchestrator.init();

    std::cout << "Aurora running: audio input='" << config.activeAudioInputName()
               << "', " << outputPtrs.size() << " output(s). Ctrl+C to stop.\n";

    // No display-derived refreshRate for audio -- 60Hz is a reasonable
    // starting tick rate, independent of aubio's own internal hop size.
    auto tickInterval = std::chrono::duration<double>(1.0 / 60.0);
    while(!g_stopRequested){
      auto tickStart = std::chrono::steady_clock::now();
      orchestrator.update(static_cast<float>(tickInterval.count()));
      std::this_thread::sleep_until(tickStart + std::chrono::duration_cast<std::chrono::steady_clock::duration>(tickInterval));
    }
#else
    std::cerr << "activeAudioInputName is set, but this build has no audio support "
                 "(AURORA_CORE_ENABLE_AUDIO/AURORA_APP_ENABLE_LINUX_AUDIO_INPUT were off)\n";
    return 1;
#endif
  }
  else{
    std::string inputName = config.activeInputName().empty() ? "linux" : config.activeInputName();
    auto input = registry.createInput(inputName);
    if(!input){
      std::cerr << "Unknown input '" << inputName << "'. Available: ";
      for(const auto& name : registry.inputNames()){ std::cerr << name << " "; }
      std::cerr << "\n";
      return 1;
    }
    input->init();

    Aurora::Runtime::Orchestrator orchestrator(*input, outputPtrs, config, Aurora::Runtime::ZoneMapStore(configRoot));
    orchestrator.init();
    configStore.save(orchestrator.config()); // persist any refreshRate/subsampleWidth just derived

    std::cout << "Aurora running: input='" << inputName << "', " << outputPtrs.size() << " output(s). Ctrl+C to stop.\n";

    auto tickInterval = std::chrono::duration<double>(1.0 / orchestrator.config().refreshRate());
    while(!g_stopRequested){
      auto tickStart = std::chrono::steady_clock::now();
      orchestrator.update();
      std::this_thread::sleep_until(tickStart + std::chrono::duration_cast<std::chrono::steady_clock::duration>(tickInterval));
    }
  }

  std::cout << "Stopping...\n";
  for(auto* output : outputPtrs){
    output->shutdown();
  }

  return 0;
}
// Plugin construction (e.g. "linux" input selection) can throw --
// catch here so that's a clean error message, not std::terminate.
catch(const std::exception& e)
{
  std::cerr << "Fatal: " << e.what() << "\n";
  return 1;
}
