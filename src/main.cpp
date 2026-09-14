// Test-script entry point wiring one Windows input to one or more outputs
// through Orchestrator. Not yet a real product app -- no pairing flow or
// zone-mapping UI exist (see Analysis/ImplementationPlan.md phase 3), so
// bridge credentials and zone maps are stopgaps: env vars and hand-edited
// profile JSON, respectively. See Analysis/DistributedArchitecturePlan.md
// for how this shape is expected to evolve.

#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <thread>

#include <windows.h>

#include <Aurora/App/Registry.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Orchestrator.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>

#include <Aurora/Input/Windows/DummyGrabber.hpp>
#ifdef AURORA_INPUT_WINDOWS_DXGI_AVAILABLE
#include <Aurora/Input/Windows/WindowsGrabber.hpp>
#endif

#ifdef AURORA_OUTPUT_HUE_IO_AVAILABLE
#include <Aurora/Output/Hue/Credentials.hpp>
#include <Aurora/Output/Hue/HueOutput.hpp>
#endif

namespace
{
  volatile bool g_stopRequested = false;

  // Console-close/Ctrl+C handler -- Windows has no SIGINT/SIGTERM, this is
  // the console-app equivalent (services would need a different mechanism).
  BOOL WINAPI handleConsoleEvent(DWORD)
  {
    g_stopRequested = true;
    return TRUE;
  }


  // Only one real capture backend exists on Windows so far (unlike Linux's
  // X11-vs-Wayland auto-select) -- "windows" just is DXGI, no dispatch layer.
  void registerInputs(Aurora::App::Registry& registry)
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

    // %APPDATA%\Aurora -- same convention huenicorn's own WindowsAdapter
    // used (%APPDATA%\Huenicorn), not the Linux app's $HOME/.config path.
    const char* appData = std::getenv("APPDATA");
    if(!appData){
      throw std::runtime_error("Neither AURORA_CONFIG_DIR nor APPDATA is set");
    }

    return std::filesystem::path(appData) / "Aurora";
  }
}


int main()
try
{
  SetConsoleCtrlHandler(handleConsoleEvent, TRUE);

  Aurora::App::Registry registry;
  registerInputs(registry);
  registerOutputs(registry);

  auto configRoot = resolveConfigRoot();
  Aurora::Runtime::ConfigStore configStore(configRoot);
  Aurora::Runtime::Config config = configStore.load();

  std::string inputName = config.activeInputName().empty() ? "windows" : config.activeInputName();
  auto input = registry.createInput(inputName);
  if(!input){
    std::cerr << "Unknown input '" << inputName << "'. Available: ";
    for(const auto& name : registry.inputNames()){ std::cerr << name << " "; }
    std::cerr << "\n";
    return 1;
  }
  input->init();

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

  std::cout << "Stopping...\n";
  for(auto* output : outputPtrs){
    output->shutdown();
  }

  return 0;
}
// Plugin construction (e.g. "windows" input selection) can throw --
// catch here so that's a clean error message, not std::terminate.
catch(const std::exception& e)
{
  std::cerr << "Fatal: " << e.what() << "\n";
  return 1;
}
