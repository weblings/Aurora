#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <fstream>
#include <cstdlib>
#include <functional>
#include <future>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <vector>
#include <thread>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ApplyRoutes.hpp>
#include <Aurora/Runtime/TestRoutes.hpp>
#include <Aurora/Runtime/ConfigApply.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/DraftRoutes.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/EffectsRoutes.hpp>
#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/MathNodes.hpp>
#include <Aurora/Runtime/Graph/BlendNodes.hpp>
#include <Aurora/Runtime/Graph/SpatialNodes.hpp>
#include <Aurora/Runtime/Graph/ColorNodes.hpp>
#include <Aurora/Runtime/Graph/TimeNodes.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>
#include <Aurora/Runtime/GraphRoutes.hpp>
#include <Aurora/Runtime/HostRoutes.hpp>
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
#include <Aurora/Runtime/Graph/AudioNodes.hpp>
#endif
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/PipelineRoutes.hpp>
#include <Aurora/Runtime/PresetRoutes.hpp>
#include <Aurora/Runtime/PublicApiRoutes.hpp>
#include <Aurora/Runtime/PreviewRoutes.hpp>
#include <Aurora/Runtime/ReloadCoalescer.hpp>
#include <Aurora/Runtime/SettingsRoutes.hpp>

#include "SseReader.hpp"

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Output;
using namespace Aurora::Runtime;
using namespace std::chrono_literals;


// Pins the behavior Pipeline/PipelineHost had as three app-side copies
// (Aurora-9ig): building from a Registry, video vs audio mode, the reload
// swap, and the two routes that sit on top of PipelineHost.
namespace
{
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-pipeline-tests-" + name))
    {
      std::filesystem::remove_all(path);
      std::filesystem::create_directories(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  // What the fakes did, readable after Registry's factories have handed
  // ownership to the Pipeline.
  struct Events
  {
    std::vector<std::string> lines;
    int sendCount{0};

    // Runs inside every FakeOutput::init(), i.e. in the window Pipeline::build
    // spends on output init -- where a settings PUT can land on real hardware.
    std::function<void()> onOutputInit;

    // What FakeVideoInput::setCaptureWidthHint() was told, and a hook that
    // runs inside it -- where a real capture API may block.
    std::vector<unsigned> widthHints;
    std::function<void()> onWidthHint;

    // Runs inside every FakeVideoInput grab, i.e. on the tick, under the host lock.
    std::function<void()> onGrab;

    // How many inputs the registry's factories opened and how many were
    // destroyed since: a reused input shows as no new open.
    int videoOpened{0}, videoClosed{0}, audioOpened{0}, audioClosed{0};

    // What FakeVideoInput::captureError() reports.
    std::string captureError;

    // Stable key on the fake monitor; empty = keyless, like a pre-key grabber.
    std::string monitorKey;

    bool has(const std::string& line) const
    {
      return std::find(lines.begin(), lines.end(), line) != lines.end();
    }
  };


  class FakeVideoInput : public IVideoInput
  {
  public:
    explicit FakeVideoInput(std::shared_ptr<Events> events = nullptr):
    m_events(std::move(events))
    {
      if(m_events){ m_events->videoOpened++; }
    }

    ~FakeVideoInput() override
    {
      if(m_events){ m_events->videoClosed++; }
    }

    void setCaptureWidthHint(unsigned width) override
    {
      if(!m_events){ return; }
      m_events->widthHints.push_back(width);
      if(m_events->onWidthHint){ m_events->onWidthHint(); }
    }

    const std::string& name() const override
    {
      static const std::string s_name = "fake-video";
      return s_name;
    }

    bool hasCustomScreenManagement() const override { return true; }
    Resolution displayResolution() const override { return {4, 2}; }
    RefreshRate displayRefreshRate() const override { return 30; }
    std::string captureError() const override { return m_events ? m_events->captureError : std::string{}; }

    void selectMonitor(unsigned monitorId) override
    {
      m_monitorSelectionData.selectedMonitorId = monitorId;
    }

    void grabFrameSubsample(ImageData& imageData) override
    {
      if(m_events && m_events->onGrab){ m_events->onGrab(); }
      imageData.format = PixelFormat::RGB;
      imageData.imageMatrix = cv::Mat(2, 4, CV_8UC3, cv::Scalar(255, 0, 0));
    }

  protected:
    void _initMonitorsList() override
    {
      auto monitor = std::make_shared<MonitorData>("Fake Monitor", 4, 2, 30.0, true);
      if(m_events){ monitor->key = m_events->monitorKey; }
      m_monitorSelectionData.monitors.push_back(std::move(monitor));
    }

  private:
    std::shared_ptr<Events> m_events;
  };


  class FakeAudioInput : public IAudioInput
  {
  public:
    explicit FakeAudioInput(std::shared_ptr<Events> events = nullptr):
    m_events(std::move(events))
    {
      if(m_events){ m_events->audioOpened++; }
    }

    ~FakeAudioInput() override
    {
      if(m_events){ m_events->audioClosed++; }
    }

    const std::string& name() const override
    {
      static const std::string s_name = "fake-audio";
      return s_name;
    }

    void readNextBuffer(AudioBuffer& buffer) override
    {
      buffer.sampleRate = 44100;
      buffer.channelCount = 1;
      buffer.samples = {0.5f, -0.5f, 0.5f, -0.5f};
    }

  private:
    std::shared_ptr<Events> m_events;
  };


  class FakeOutput : public IOutput
  {
  public:
    FakeOutput(std::string name, std::shared_ptr<Events> events):
    m_name(std::move(name)),
    m_events(std::move(events))
    {}

    const std::string& name() const override { return m_name; }
    void init() override
    {
      m_connected = true;
      m_events->lines.push_back("init " + m_name);
      if(m_events->onOutputInit){ m_events->onOutputInit(); }
    }
    bool isConnected() const override { return m_connected; }

    void shutdown(bool isReplacement) override
    {
      m_connected = false;
      m_events->lines.push_back("shutdown " + m_name + (isReplacement ? " replacement" : " final"));
    }

    std::vector<uint8_t> zoneIds() const override { return {1, 2}; }
    void send(const Frame&) override { m_events->sendCount++; }

  private:
    std::string m_name;
    std::shared_ptr<Events> m_events;
    bool m_connected{false};
  };


  Registry makeRegistry(const std::shared_ptr<Events>& events)
  {
    Registry registry;
    registry.registerInput("fake-video", [events]{ return std::make_unique<FakeVideoInput>(events); });
    registry.registerAudioInput("fake-audio", [events]{ return std::make_unique<FakeAudioInput>(events); });
    registry.registerOutput("out-a", [events]{ return std::make_unique<FakeOutput>("out-a", events); });
    registry.registerOutput("out-b", [events]{ return std::make_unique<FakeOutput>("out-b", events); });
    return registry;
  }


  Config videoConfig()
  {
    Config config;
    config.setActiveInputName("fake-video");
    return config;
  }


  Config audioConfig()
  {
    Config config;
    config.setActiveAudioInputName("fake-audio");
    return config;
  }


  struct LogCapture
  {
    std::vector<std::pair<LogLevel, std::string>> lines;

    PipelineOptions options()
    {
      PipelineOptions options;
      options.log = [this](LogLevel level, const std::string& line){ lines.emplace_back(level, line); };
      return options;
    }

    bool has(LogLevel level, const std::string& line) const
    {
      for(const auto& [l, text] : lines){
        if(l == level && text == line) return true;
      }
      return false;
    }
  };


  httplib::Result getWithRetry(httplib::Client& client, const std::string& path)
  {
    httplib::Result result;
    for(int attempt = 0; attempt < 50; ++attempt){
      result = client.Get(path);
      if(result && result->status != -1){
        return result;
      }
      std::this_thread::sleep_for(10ms);
    }
    return result;
  }
}


TEST_CASE("Pipeline::build returns null and creates nothing when Config names no input", "[Pipeline]")
{
  ScopedTempDir dir("no-input");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  CHECK(Pipeline::build(registry, Config{}, dir.path, {}) == nullptr);
  CHECK(events->lines.empty());
}


TEST_CASE("Pipeline::build's derived-field save keeps a PUT that landed mid-build (Aurora-d6i7)", "[Pipeline]")
{
  ScopedTempDir dir("build-race");
  ConfigStore(dir.path).save(videoConfig());

  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  // A settings PUT's load -> patch -> save, landing after build() has already
  // been handed its Config but before it persists the derived rate.
  bool putLanded = false;
  events->onOutputInit = [&]{
    if(putLanded){ return; }
    putLanded = true;
    ConfigStore store(dir.path);
    Config onDisk = store.load();
    onDisk.setTransitionSmoothing(0.5f);
    store.save(onDisk);
  };

  Config config = ConfigStore(dir.path).load();
  auto pipeline = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(pipeline);
  REQUIRE(putLanded);

  Config persisted = ConfigStore(dir.path).load();
  CHECK(persisted.transitionSmoothing() == Catch::Approx(0.5f)); // the PUT survived
  CHECK(persisted.refreshRate() == 30);                          // the derived rate still landed
  CHECK(persisted.activeInputName() == "fake-video");
}


TEST_CASE("Pipeline::build only fills derived fields that are still unset on disk (Aurora-d6i7)", "[Pipeline]")
{
  ScopedTempDir dir("build-derived-fill");
  ConfigStore(dir.path).save(videoConfig());

  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  // The user picks 60 Hz while the build that would derive 30 is in flight.
  bool putLanded = false;
  events->onOutputInit = [&]{
    if(putLanded){ return; }
    putLanded = true;
    ConfigStore store(dir.path);
    Config onDisk = store.load();
    onDisk.setRefreshRate(60);
    store.save(onDisk);
  };

  Config config = ConfigStore(dir.path).load();
  REQUIRE(Pipeline::build(registry, config, dir.path, {}));

  CHECK(ConfigStore(dir.path).load().refreshRate() == 60);
}


TEST_CASE("Pipeline::build migrates a saved monitor name to its key on disk (Aurora-5ipy.30)", "[Pipeline]")
{
  ScopedTempDir dir("monitor-key-migrate");
  Config saved = videoConfig();
  saved.setActiveMonitorName("Fake Monitor");
  ConfigStore(dir.path).save(saved);

  auto events = std::make_shared<Events>();
  events->monitorKey = "fake-key";
  auto registry = makeRegistry(events);

  REQUIRE(Pipeline::build(registry, ConfigStore(dir.path).load(), dir.path, {}));
  CHECK(ConfigStore(dir.path).load().activeMonitorName() == "fake-key");

  // The next build resolves the key directly and leaves disk as it is.
  REQUIRE(Pipeline::build(registry, ConfigStore(dir.path).load(), dir.path, {}));
  CHECK(ConfigStore(dir.path).load().activeMonitorName() == "fake-key");
}


TEST_CASE("Pipeline::build keeps a monitor pick that landed mid-build over the migration (Aurora-5ipy.30)", "[Pipeline]")
{
  ScopedTempDir dir("monitor-key-race");
  Config saved = videoConfig();
  saved.setActiveMonitorName("Fake Monitor");
  ConfigStore(dir.path).save(saved);

  auto events = std::make_shared<Events>();
  events->monitorKey = "fake-key";
  auto registry = makeRegistry(events);

  // The user picks another monitor while the build is in flight.
  bool putLanded = false;
  events->onOutputInit = [&]{
    if(putLanded){ return; }
    putLanded = true;
    ConfigStore store(dir.path);
    Config onDisk = store.load();
    onDisk.setActiveMonitorName("other-key");
    store.save(onDisk);
  };

  REQUIRE(Pipeline::build(registry, ConfigStore(dir.path).load(), dir.path, {}));
  REQUIRE(putLanded);
  CHECK(ConfigStore(dir.path).load().activeMonitorName() == "other-key");
}


TEST_CASE("Pipeline::build leaves a name alone when the monitor has no key (Aurora-5ipy.30)", "[Pipeline]")
{
  ScopedTempDir dir("monitor-keyless");
  Config saved = videoConfig();
  saved.setActiveMonitorName("Fake Monitor");
  ConfigStore(dir.path).save(saved);

  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  REQUIRE(Pipeline::build(registry, ConfigStore(dir.path).load(), dir.path, {}));
  CHECK(ConfigStore(dir.path).load().activeMonitorName() == "Fake Monitor");
}


TEST_CASE("Pipeline::build in video mode runs every registered output when none are selected", "[Pipeline]")
{
  ScopedTempDir dir("video");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  LogCapture log;

  auto pipeline = Pipeline::build(registry, videoConfig(), dir.path, log.options());
  REQUIRE(pipeline);

  CHECK_FALSE(pipeline->isAudioMode());
  CHECK(pipeline->audioInput() == nullptr);
  CHECK(events->has("init out-a"));
  CHECK(events->has("init out-b"));

  // refreshRate unset in Config, so derived from the display (30 Hz) and
  // persisted back to disk.
  CHECK(pipeline->tickIntervalSeconds() == Catch::Approx(1.0 / 30));
  CHECK(ConfigStore(dir.path).load().refreshRate() == 30);

  auto monitors = pipeline->listMonitors();
  REQUIRE(monitors.size() == 1);
  CHECK(monitors[0]->name == "Fake Monitor");

  pipeline->tick(static_cast<float>(pipeline->tickIntervalSeconds()));
  CHECK(events->sendCount > 0);

  CHECK(log.has(LogLevel::Info, "Aurora running: input='fake-video', 2 output(s)."));
}


TEST_CASE("Pipeline::build honors activeOutputNames and skips unknown outputs with an error log", "[Pipeline]")
{
  ScopedTempDir dir("selected-outputs");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  LogCapture log;

  auto config = videoConfig();
  config.setActiveOutputNames({"out-b", "missing"});
  auto pipeline = Pipeline::build(registry, config, dir.path, log.options());
  REQUIRE(pipeline);

  CHECK(events->has("init out-b"));
  CHECK_FALSE(events->has("init out-a"));
  CHECK(log.has(LogLevel::Error, "Unknown output 'missing', skipping"));
}


TEST_CASE("Pipeline::build throws when no selected output exists", "[Pipeline]")
{
  ScopedTempDir dir("no-outputs");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  auto config = videoConfig();
  config.setActiveOutputNames({"missing"});
  CHECK_THROWS_WITH(
    Pipeline::build(registry, config, dir.path, {}),
    "No outputs available -- nothing to drive"
  );
}


TEST_CASE("Pipeline::build throws on an unknown video input", "[Pipeline]")
{
  ScopedTempDir dir("unknown-input");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  Config config;
  config.setActiveInputName("nope");
  CHECK_THROWS_WITH(Pipeline::build(registry, config, dir.path, {}), "Unknown input 'nope'");
}


TEST_CASE("Pipeline::build picks video when both an input and an audio input are named", "[Pipeline]")
{
  ScopedTempDir dir("video-wins");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  auto config = videoConfig();
  config.setActiveAudioInputName("fake-audio");
  auto pipeline = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(pipeline);
  CHECK_FALSE(pipeline->isAudioMode());
}


TEST_CASE("Pipeline::capabilities in video mode uses video and samples zones (Aurora-kea)", "[Pipeline]")
{
  ScopedTempDir dir("capabilities-video");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  auto pipeline = Pipeline::build(registry, videoConfig(), dir.path, {});
  REQUIRE(pipeline);
  const PipelineCapabilities capabilities = pipeline->capabilities();
  CHECK(capabilities.usesVideoInput);
  CHECK_FALSE(capabilities.usesAudioInput);
  CHECK(capabilities.samplesZones);
}


#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
TEST_CASE("Pipeline::build in audio mode ticks at the default rate with no monitors", "[Pipeline][Audio]")
{
  ScopedTempDir dir("audio");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  LogCapture log;

  auto pipeline = Pipeline::build(registry, audioConfig(), dir.path, log.options());
  REQUIRE(pipeline);

  CHECK(pipeline->isAudioMode());
  REQUIRE(pipeline->audioInput() != nullptr);
  CHECK(pipeline->audioInput()->name() == "fake-audio");
  CHECK(pipeline->tickIntervalSeconds() == Catch::Approx(tickIntervalSeconds()));
  CHECK(pipeline->listMonitors().empty());

  pipeline->tick(static_cast<float>(pipeline->tickIntervalSeconds()));
  CHECK(events->sendCount > 0);

  CHECK(log.has(LogLevel::Info, "Aurora running: audio input='fake-audio', 2 output(s)."));
}


TEST_CASE("Pipeline::capabilities in audio mode uses audio and samples no zones (Aurora-kea)", "[Pipeline][Audio]")
{
  ScopedTempDir dir("capabilities-audio");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  auto pipeline = Pipeline::build(registry, audioConfig(), dir.path, {});
  REQUIRE(pipeline);
  const PipelineCapabilities capabilities = pipeline->capabilities();
  CHECK_FALSE(capabilities.usesVideoInput);
  CHECK(capabilities.usesAudioInput);
  CHECK_FALSE(capabilities.samplesZones);
}


TEST_CASE("Pipeline::build throws on an unknown audio input", "[Pipeline][Audio]")
{
  ScopedTempDir dir("unknown-audio");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  Config config;
  config.setActiveAudioInputName("nope");
  CHECK_THROWS_WITH(Pipeline::build(registry, config, dir.path, {}), "Unknown audio input 'nope'");
}


TEST_CASE("Pipeline zone list and update work in audio mode", "[Pipeline][Audio]")
{
  ScopedTempDir dir("audio-zones");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  // Explicit order: Registry::outputNames() is unordered.
  auto config = audioConfig();
  config.setActiveOutputNames({"out-b", "out-a"});
  auto pipeline = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(pipeline);

  auto before = pipeline->listZones();
  CHECK(before.outputName == "out-b");
  CHECK(before.zones.size() == 2);

  CHECK(pipeline->updateZone(1, std::nullopt, false, std::nullopt));
  auto after = pipeline->listZones();
  auto zone = std::find_if(after.zones.begin(), after.zones.end(), [](const ZoneConfig& z){ return z.zoneId == 1; });
  REQUIRE(zone != after.zones.end());
  CHECK_FALSE(zone->active);
}
#else
TEST_CASE("Pipeline::build throws the app's no-audio message in a build without audio", "[Pipeline]")
{
  ScopedTempDir dir("no-audio-build");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineOptions options;
  options.noAudioSupportMessage = "no audio here";
  CHECK_THROWS_WITH(Pipeline::build(registry, audioConfig(), dir.path, options), "no audio here");
}
#endif


TEST_CASE("Pipeline zone list and update work in video mode, first output only", "[Pipeline]")
{
  ScopedTempDir dir("video-zones");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  // Explicit order: Registry::outputNames() is unordered.
  auto config = videoConfig();
  config.setActiveOutputNames({"out-b", "out-a"});
  auto pipeline = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(pipeline);

  auto before = pipeline->listZones();
  CHECK(before.outputName == "out-b");
  CHECK(before.zones.size() == 2);

  CHECK(pipeline->updateZone(2, std::nullopt, false, std::nullopt));
  auto after = pipeline->listZones();
  auto zone = std::find_if(after.zones.begin(), after.zones.end(), [](const ZoneConfig& z){ return z.zoneId == 2; });
  REQUIRE(zone != after.zones.end());
  CHECK_FALSE(zone->active);
}


TEST_CASE("PipelineHost with no pipeline is idle, not an error", "[PipelineHost]")
{
  PipelineHost host(nullptr, {});

  host.tick();
  CHECK(host.tickIntervalSeconds() == Catch::Approx(tickIntervalSeconds()));
  CHECK(host.listMonitors().empty());
  CHECK(host.listZones().outputName.empty());
  CHECK_FALSE(host.updateZone(1, std::nullopt, true, std::nullopt));
  CHECK(host.withAudioInput([](IAudioInput* input){ return input == nullptr; }));
  host.shutdown();
}


TEST_CASE("PipelineHost::reload swaps in the new pipeline and shuts the old one down as a replacement", "[PipelineHost]")
{
  ScopedTempDir dir("reload-swap");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  auto first = videoConfig();
  first.setActiveOutputNames({"out-a"});
  PipelineHost host(Pipeline::build(registry, first, dir.path, {}), {});
  CHECK(host.listZones().outputName == "out-a");

  auto second = videoConfig();
  second.setActiveOutputNames({"out-b"});
  std::string error;
  REQUIRE(host.reload(registry, second, dir.path, error));
  CHECK(error.empty());

  CHECK(events->has("shutdown out-a replacement"));
  CHECK(host.listZones().outputName == "out-b");

  host.shutdown();
  CHECK(events->has("shutdown out-b final"));
}


TEST_CASE("PipelineHost::reload into the empty state from a fresh install", "[PipelineHost]")
{
  ScopedTempDir dir("reload-fresh");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineHost host(nullptr, {});
  std::string error;
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  CHECK(host.listMonitors().size() == 1);
}


TEST_CASE("PipelineHost::reload failure keeps the old pipeline running and reports the error", "[PipelineHost]")
{
  ScopedTempDir dir("reload-fail");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.reload(registry, bad, dir.path, error));
  CHECK(error == "Unknown input 'nope'");
  CHECK_FALSE(events->has("shutdown out-a replacement"));
  CHECK(host.listMonitors().size() == 1);
}


TEST_CASE("PipelineHost::reload runs a failed build's exception through describeBuildError", "[PipelineHost]")
{
  ScopedTempDir dir("reload-describe");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineOptions options;
  options.describeBuildError = [](const std::exception& e){ return std::string("mapped: ") + e.what(); };
  PipelineHost host(nullptr, options);

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.reload(registry, bad, dir.path, error));
  CHECK(error == "mapped: Unknown input 'nope'");
}


TEST_CASE("reloadPipelineFromDisk reads the saved Config, not a stale copy", "[PipelineHost]")
{
  ScopedTempDir dir("reload-disk");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  ConfigStore(dir.path).save(videoConfig());
  CHECK(reloadPipelineFromDisk(host, registry, dir.path).empty());
  CHECK(host.listMonitors().size() == 1);

  Config bad;
  bad.setActiveInputName("nope");
  ConfigStore(dir.path).save(bad);
  CHECK(reloadPipelineFromDisk(host, registry, dir.path) == "Unknown input 'nope'");
}


TEST_CASE("Host routes answer capabilities, version and stop", "[HostRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});
  std::atomic<int> stops{0};

  // Two servers differ only in the platform string and the hue quirk.
  auto serve = [&](bool hueCompiledIn, const char* platform, bool canSelectMonitor){
    auto server = std::make_unique<HttpServer>();
    registerCapabilitiesRoute(*server, registry, host, platform, hueCompiledIn, canSelectMonitor);
    registerVersionRoute(*server, "9.8.7");
    registerStopRoute(*server, [&stops]{ ++stops; });
    return server;
  };

  auto plain = serve(false, "linux", false);
  auto hue = serve(true, "mac", true);
  const int plainPort = plain->bindToAnyPort("127.0.0.1");
  const int huePort = hue->bindToAnyPort("127.0.0.1");
  REQUIRE(plainPort > 0);
  REQUIRE(huePort > 0);
  std::thread plainThread([&](){ plain->listen(); });
  std::thread hueThread([&](){ hue->listen(); });

  httplib::Client plainClient("127.0.0.1", plainPort);
  auto caps = getWithRetry(plainClient, "/api/capabilities");
  REQUIRE(caps);
  CHECK(caps->status == 200);
  CHECK(caps->get_header_value("Content-Type").find("application/json") == 0);
  auto capsJson = nlohmann::json::parse(caps->body);
  CHECK(capsJson["platform"] == "linux");
  CHECK(capsJson["paused"] == false);
  CHECK(capsJson["inputs"] == nlohmann::json(registry.inputNames()));
  CHECK(capsJson["audioInputs"] == nlohmann::json(registry.audioInputNames()));
  CHECK(capsJson["outputs"] == nlohmann::json(registry.outputNames()));
  CHECK(capsJson["zeroOffOutputs"] == nlohmann::json(registry.zeroOffOutputNames()));
  CHECK(capsJson["canSelectMonitor"] == false);
  CHECK(capsJson.size() == 7);

  // "hue" is listed once even though it was never registered.
  httplib::Client hueClient("127.0.0.1", huePort);
  auto hueCaps = getWithRetry(hueClient, "/api/capabilities");
  REQUIRE(hueCaps);
  auto hueJson = nlohmann::json::parse(hueCaps->body);
  CHECK(hueJson["platform"] == "mac");
  CHECK(hueJson["canSelectMonitor"] == true);
  auto outputs = hueJson["outputs"].get<std::vector<std::string>>();
  CHECK(std::count(outputs.begin(), outputs.end(), "hue") == 1);

  auto version = plainClient.Get("/api/version");
  REQUIRE(version);
  CHECK(version->status == 200);
  CHECK(nlohmann::json::parse(version->body) == nlohmann::json{{"version", "9.8.7"}, {"apiVersion", kApiVersion}});

  CHECK(stops == 0);
  auto stop = plainClient.Post("/api/stop");
  REQUIRE(stop);
  CHECK(stop->status == 200);
  CHECK(stop->body == R"({"succeeded":true})");
  CHECK(stops == 1);

  plain->stop();
  hue->stop();
  plainThread.join();
  hueThread.join();
}


TEST_CASE("Monitors and reload routes answer from PipelineHost", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("routes");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  HttpServer server;
  registerMonitorsRoute(server, host);
  registerReloadRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);

  // No pipeline yet: an empty list, not an error.
  auto empty = getWithRetry(client, "/api/monitors");
  REQUIRE(empty);
  CHECK(empty->status == 200);
  CHECK(nlohmann::json::parse(empty->body)["monitors"].empty());

  Config bad;
  bad.setActiveInputName("nope");
  ConfigStore(dir.path).save(bad);
  auto failed = client.Post("/api/reload");
  REQUIRE(failed);
  CHECK(failed->status == 500);
  auto failedJson = nlohmann::json::parse(failed->body);
  CHECK(failedJson["succeeded"] == false);
  CHECK(failedJson["code"] == "reload_failed");
  CHECK(failedJson["message"] == "Unknown input 'nope'");

  ConfigStore(dir.path).save(videoConfig());
  auto succeeded = client.Post("/api/reload");
  REQUIRE(succeeded);
  CHECK(succeeded->status == 200);
  CHECK(nlohmann::json::parse(succeeded->body) == nlohmann::json{{"succeeded", true}});

  auto monitors = client.Get("/api/monitors");
  REQUIRE(monitors);
  auto list = nlohmann::json::parse(monitors->body)["monitors"];
  REQUIRE(list.size() == 1);
  CHECK(list[0]["id"] == 0);
  CHECK(list[0]["name"] == "Fake Monitor");
  CHECK(list[0]["width"] == 4);
  CHECK(list[0]["height"] == 2);
  CHECK(list[0]["refreshRate"] == 30.0);
  CHECK(list[0]["isPrimary"] == true);

  server.stop();
  serverThread.join();
}


TEST_CASE("PipelineHost::pause shuts down for good once and resume rebuilds from the same config (Aurora-3ddb)", "[PipelineHost]")
{
  ScopedTempDir dir("pause-resume");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  auto config = videoConfig();
  config.setActiveOutputNames({"out-a"});
  PipelineHost host(Pipeline::build(registry, config, dir.path, {}), {});

  CHECK(host.pause());
  CHECK(host.isPaused());
  CHECK(events->has("shutdown out-a final"));
  CHECK_FALSE(host.pause());

  // Dashboard data survives the teardown.
  CHECK(host.listMonitors().size() == 1);
  CHECK(host.listZones().outputName == "out-a");
  CHECK_FALSE(host.updateZone(1, std::nullopt, true, std::nullopt));

  std::string error;
  REQUIRE(host.resume(registry, config, dir.path, error));
  CHECK_FALSE(host.isPaused());
  CHECK(host.listZones().outputName == "out-a");
  CHECK(host.resume(registry, config, dir.path, error));
  host.shutdown();
}


TEST_CASE("PipelineHost::pause with no pipeline is a no-op (Aurora-3ddb)", "[PipelineHost]")
{
  PipelineHost host(nullptr, {});
  CHECK_FALSE(host.pause());
  CHECK_FALSE(host.isPaused());
}


TEST_CASE("PipelineHost::reload and applyConfigFromDisk stay paused (Aurora-3ddb)", "[PipelineHost]")
{
  ScopedTempDir dir("pause-reload");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  REQUIRE(host.pause());

  CHECK(reloadPipelineFromDisk(host, registry, dir.path).empty());
  CHECK(applyConfigFromDisk(host, registry, dir.path).empty());
  CHECK(host.isPaused());
  CHECK(host.tickIntervalSeconds() == Catch::Approx(tickIntervalSeconds()));
}


TEST_CASE("PipelineHost::resume failure stays paused and reports the error (Aurora-3ddb)", "[PipelineHost]")
{
  ScopedTempDir dir("pause-resume-fail");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  REQUIRE(host.pause());

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.resume(registry, bad, dir.path, error));
  CHECK(error == "Unknown input 'nope'");
  CHECK(host.isPaused());

  error.clear();
  CHECK(host.resume(registry, videoConfig(), dir.path, error));
  CHECK_FALSE(host.isPaused());
}


TEST_CASE("setRunning pauses and resumes idempotently and reports a failed resume (Aurora-5ipy.18)", "[PipelineHost]")
{
  ScopedTempDir dir("set-running");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  std::string error;

  for(int i = 0; i < 2; ++i){
    CHECK(host.setRunning(false, registry, dir.path, error));
    CHECK(host.isPaused());
  }

  Config broken;
  broken.setActiveInputName("nope");
  ConfigStore(dir.path).save(broken);
  CHECK_FALSE(host.setRunning(true, registry, dir.path, error));
  CHECK(error == "Unknown input 'nope'");
  CHECK(host.isPaused());

  ConfigStore(dir.path).save(videoConfig());
  for(int i = 0; i < 2; ++i){
    CHECK(host.setRunning(true, registry, dir.path, error));
    CHECK_FALSE(host.isPaused());
  }
  host.shutdown();
}


TEST_CASE("PUT /api/state pauses and resumes, idempotently (Aurora-3ddb)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("state-route");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto put = [&](const std::string& body){ return client.Put("/api/state", body, "application/json"); };

  for(int i = 0; i < 2; ++i){
    auto paused = put(R"({"running":false})");
    REQUIRE(paused);
    CHECK(paused->status == 200);
    CHECK(nlohmann::json::parse(paused->body) == nlohmann::json{{"succeeded", true}, {"running", false}, {"state", "paused"}});
    CHECK(host.isPaused());
  }

  auto bad = put(R"({"running":"yes"})");
  REQUIRE(bad);
  CHECK(bad->status == 400);

  Config broken;
  broken.setActiveInputName("nope");
  ConfigStore(dir.path).save(broken);
  auto failed = put(R"({"running":true})");
  REQUIRE(failed);
  CHECK(failed->status == 500);
  CHECK(nlohmann::json::parse(failed->body)["code"] == "set_running_failed");
  CHECK(nlohmann::json::parse(failed->body)["message"] == "Unknown input 'nope'");
  CHECK(host.isPaused());

  ConfigStore(dir.path).save(videoConfig());
  for(int i = 0; i < 2; ++i){
    auto resumed = put(R"({"running":true})");
    REQUIRE(resumed);
    CHECK(nlohmann::json::parse(resumed->body) == nlohmann::json{{"succeeded", true}, {"running", true}, {"state", "running"}});
    CHECK_FALSE(host.isPaused());
  }

  server.stop();
  serverThread.join();
  host.shutdown();
}


namespace
{
  bool isIdle(const PipelineCapabilities& c)
  {
    return !c.usesVideoInput && !c.usesAudioInput && !c.samplesZones;
  }
}


TEST_CASE("PipelineHost::capabilities follow swaps, not failed reloads or pause (Aurora-kea)", "[PipelineHost]")
{
  ScopedTempDir dir("host-capabilities");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  std::string error;

  PipelineHost host(nullptr, {});
  CHECK(isIdle(host.capabilities()));
  CHECK(host.audioDevicesUrl().empty());

  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  CHECK(host.capabilities().usesVideoInput);
  CHECK(host.capabilities().samplesZones);

  // The old pipeline keeps running, so its capabilities stand.
  Config bad;
  bad.setActiveInputName("nope");
  CHECK_FALSE(host.reload(registry, bad, dir.path, error));
  CHECK(host.capabilities().usesVideoInput);

#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
  REQUIRE(host.reload(registry, audioConfig(), dir.path, error));
  CHECK_FALSE(host.capabilities().usesVideoInput);
  CHECK(host.capabilities().usesAudioInput);
  CHECK_FALSE(host.capabilities().samplesZones);

  // Pause keeps the last capabilities; a reload while paused builds
  // nothing, so they don't move either.
  REQUIRE(host.pause());
  CHECK(host.capabilities().usesAudioInput);
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  CHECK(host.capabilities().usesAudioInput);

  REQUIRE(host.resume(registry, videoConfig(), dir.path, error));
  CHECK(host.capabilities().usesVideoInput);
  CHECK_FALSE(host.capabilities().usesAudioInput);
#endif

  // A reload into a Config naming no input leaves nothing running.
  REQUIRE(host.reload(registry, Config{}, dir.path, error));
  CHECK(isIdle(host.capabilities()));
  host.shutdown();
}


TEST_CASE("PipelineHost::capabilities start from the initial pipeline (Aurora-kea)", "[PipelineHost]")
{
  ScopedTempDir dir("host-capabilities-initial");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  CHECK(host.capabilities().usesVideoInput);
  CHECK(host.capabilities().samplesZones);
  host.shutdown();
}


TEST_CASE("GET /api/state reports paused and the running pipeline's capabilities (Aurora-kea)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("state-get");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineOptions options;
  options.audioDevicesUrl = "/api/test/audio-devices";
  PipelineHost host(nullptr, options);

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto state = [&](){
    auto result = getWithRetry(client, "/api/state");
    REQUIRE(result);
    REQUIRE(result->status == 200);
    return nlohmann::json::parse(result->body);
  };

  CHECK(state() == nlohmann::json{
    {"state", "idle"},
    {"effect", nullptr},
    {"requestedEffect", nullptr},
    {"effectTitle", nullptr},
    {"effectDescription", nullptr},
    {"mcpEffectId", nullptr},
    {"source", {{"video", nullptr}, {"audio", nullptr}}},
    {"graphInputs", nullptr},
    {"errors", nlohmann::json::array()},
    {"conditions", nlohmann::json::array()},
    {"paused", false},
    {"canStop", true},
    {"usesVideoInput", false},
    {"usesAudioInput", false},
    {"samplesZones", false},
    {"brightness", 1.0},
    {"test", {{"active", false}, {"confirmRemainingMs", 0}, {"holder", nullptr}}},
    {"audioDevicesUrl", "/api/test/audio-devices"}
  });

  std::string error;
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  auto running = state();
  CHECK(running["state"] == "running");
  CHECK(running["usesVideoInput"] == true);
  CHECK(running["usesAudioInput"] == false);
  CHECK(running["samplesZones"] == true);
  CHECK(running["graphInputs"] == nlohmann::json({{"video", true}, {"audio", false}}));
  CHECK(running["effectTitle"] == "Screen colors");
  CHECK(running["effectDescription"].is_string());

  // A custom graph reports the sources its nodes declare (Aurora-tc8w).
  REQUIRE(EffectStore(dir.path).write("mine", Graph::builtInVideoGraph({"out-a", "out-b"}), error));
  Config custom = videoConfig();
  custom.setActiveEffectId("mine");
  REQUIRE(host.reload(registry, custom, dir.path, error));
  CHECK(state()["graphInputs"] == nlohmann::json({{"video", true}, {"audio", false}}));
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));

  host.setCondition("local_network", "blocked");
  CHECK(state()["conditions"] == nlohmann::json::array({{{"source", "local_network"}, {"message", "blocked"}}}));
  host.clearCondition("local_network");

  REQUIRE(host.pause());
  auto paused = state();
  CHECK(paused["state"] == "paused");
  CHECK(paused["errors"].empty());
  CHECK(paused["paused"] == true);
  CHECK(paused["usesVideoInput"] == true);
  CHECK(paused["samplesZones"] == true);

  server.stop();
  serverThread.join();
}


TEST_CASE("GET /api/state reports effect and source, kept through pause (Aurora-5ipy.2)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("state-get-source");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineOptions options;
  options.describeAudioSink = [](Aurora::Input::IAudioInput&){ return std::string("resolved-sink"); };
  PipelineHost host(nullptr, options);

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto state = [&](){
    auto result = getWithRetry(client, "/api/state");
    REQUIRE(result);
    return nlohmann::json::parse(result->body);
  };

  std::string error;
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  auto video = state();
  CHECK(video["effect"] == "builtin.video");
  CHECK(video["source"] == nlohmann::json{
    {"video", {{"input", "fake-video"}, {"monitor", nullptr}}},
    {"audio", nullptr}
  });

  REQUIRE(host.pause());
  CHECK(state()["effect"] == "builtin.video");
  CHECK(state()["source"]["video"]["input"] == "fake-video");

#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
  REQUIRE(host.resume(registry, audioConfig(), dir.path, error));
  auto audio = state();
  CHECK(audio["effect"] == "builtin.audio");
  CHECK(audio["source"]["video"].is_null());
  // Running: the platform hook's resolved sink, still following the default.
  CHECK(audio["source"]["audio"] == nlohmann::json{
    {"input", "fake-audio"}, {"sink", "resolved-sink"}, {"auto", true}
  });

  auto pinned = audioConfig();
  pinned.setAudioTargetSinkName("usb-sink");
  REQUIRE(host.reload(registry, pinned, dir.path, error));
  REQUIRE(host.pause());
  // Paused: no live input to ask, so the configured target.
  CHECK(state()["source"]["audio"] == nlohmann::json{
    {"input", "fake-audio"}, {"sink", "usb-sink"}, {"auto", false}
  });
#endif

  // Still paused here, so resume is what applies the empty Config.
  REQUIRE(host.resume(registry, Config{}, dir.path, error));
  CHECK(state()["effect"].is_null());

  server.stop();
  serverThread.join();
  host.shutdown();
}


TEST_CASE("GET /api/state reports a null audioDevicesUrl when the build has none (Aurora-kea)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("state-get-no-devices");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto result = getWithRetry(client, "/api/state");
  REQUIRE(result);
  CHECK(nlohmann::json::parse(result->body)["audioDevicesUrl"].is_null());
  CHECK(nlohmann::json::parse(result->body)["mcpEffectId"].is_null());

  server.stop();
  serverThread.join();
}


// Aurora-d3ec: the host holds the last build failure and reports it with its
// state as one snapshot.
namespace
{
  std::exception_ptr buildFailure(const Registry& registry, const std::filesystem::path& dir)
  {
    Config bad;
    bad.setActiveInputName("nope");
    try{ Pipeline::build(registry, bad, dir, {}); }
    catch(...){ return std::current_exception(); }
    return nullptr;
  }
}


TEST_CASE("PipelineHost holds the startup failure as Failed + a startup error until a build succeeds (Aurora-d3ec)", "[PipelineHost]")
{
  ScopedTempDir dir("host-startup-failed");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  PipelineOptions options;
  options.describeBuildError = [](const std::exception& e){ return std::string("mapped: ") + e.what(); };
  PipelineHost host(nullptr, options, buildFailure(registry, dir.path));

  HostStatus status = host.status();
  CHECK(status.state == HostState::Failed);
  REQUIRE(status.errors.size() == 1);
  CHECK(status.errors[0].source == "startup");
  CHECK(status.errors[0].message == "mapped: Unknown input 'nope'");
  CHECK_FALSE(host.isPaused());

  std::string error;
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  status = host.status();
  CHECK(status.state == HostState::Running);
  CHECK(status.errors.empty());
  host.shutdown();
}


TEST_CASE("PipelineHost with nothing configured is Idle, not Failed (Aurora-d3ec)", "[PipelineHost]")
{
  ScopedTempDir dir("host-idle");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  // A fresh install: build() returns null (no input chosen yet), no throw.
  auto initial = Pipeline::build(registry, Config{}, dir.path, {});
  REQUIRE_FALSE(initial);
  PipelineHost host(std::move(initial), {});
  CHECK(host.status().state == HostState::Idle);
  CHECK(host.status().errors.empty());

  // Mid-onboarding: an input is chosen but no output is registered yet.
  Registry noOutputs;
  noOutputs.registerInput("fake-video", [events]{ return std::make_unique<FakeVideoInput>(events); });
  std::string error;
  CHECK_FALSE(host.reload(noOutputs, videoConfig(), dir.path, error));
  CHECK(host.status().state == HostState::Failed);
  REQUIRE(host.status().errors.size() == 1);
  CHECK(host.status().errors[0].source == "reload");
  CHECK(host.status().errors[0].message == "No outputs available -- nothing to drive");
}


TEST_CASE("PipelineHost keeps a failed resume's error on the paused snapshot until a resume succeeds (Aurora-d3ec)", "[PipelineHost]")
{
  ScopedTempDir dir("host-resume-failed");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  REQUIRE(host.pause());
  CHECK(host.status().state == HostState::Paused);
  CHECK(host.status().errors.empty());

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.resume(registry, bad, dir.path, error));
  HostStatus status = host.status();
  CHECK(status.state == HostState::Paused);
  REQUIRE(status.errors.size() == 1);
  CHECK(status.errors[0].source == "resume");
  CHECK(status.errors[0].message == "Unknown input 'nope'");

  // A settings reload while paused applies on resume and must not clear it.
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  CHECK(host.status().errors.size() == 1);

  REQUIRE(host.resume(registry, videoConfig(), dir.path, error));
  status = host.status();
  CHECK(status.state == HostState::Running);
  CHECK(status.errors.empty());
  host.shutdown();
}


TEST_CASE("PipelineHost holds a failed reload's error while the old pipeline keeps running (Aurora-ja76)", "[PipelineHost]")
{
  ScopedTempDir dir("host-reload-running");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.reload(registry, bad, dir.path, error));
  HostStatus status = host.status();
  CHECK(status.state == HostState::Running);
  REQUIRE(status.errors.size() == 1);
  CHECK(status.errors[0].source == "reload");
  CHECK(status.errors[0].message == "Unknown input 'nope'");
  CHECK(status.errors[0].id > 0);

  // A successful build clears everything held, including other sources.
  REQUIRE(host.setError("audio_permission", "denied"));
  CHECK(host.status().errors.size() == 2);
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  CHECK(host.status().state == HostState::Running);
  CHECK(host.status().errors.empty());
  host.shutdown();
}


TEST_CASE("PipelineHost: pause clears a held error and a reload while paused holds nothing (Aurora-ja76)", "[PipelineHost]")
{
  ScopedTempDir dir("host-reload-pause");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  REQUIRE_FALSE(host.reload(registry, bad, dir.path, error));
  REQUIRE(host.status().errors.size() == 1);

  REQUIRE(host.pause());
  CHECK(host.status().state == HostState::Paused);
  CHECK(host.status().errors.empty());

  // Paused reload saves without building, so there is nothing to fail.
  CHECK(host.reload(registry, bad, dir.path, error));
  CHECK(host.status().errors.empty());
  CHECK_FALSE(host.setError("audio_permission", "denied"));
  host.shutdown();
}


TEST_CASE("A reload failure that lands after a pause stores nothing (Aurora-ja76)", "[PipelineHost]")
{
  ScopedTempDir dir("host-failure-after-pause");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  // The failing build inits its outputs before it fails on the unknown
  // input; a pause lands inside that window.
  bool nested = false;
  events->onOutputInit = [&]{
    if(nested){ return; }
    nested = true;
    REQUIRE(host.pause());
  };

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.reload(registry, bad, dir.path, error));
  CHECK(host.status().state == HostState::Paused);
  CHECK(host.status().errors.empty());
  host.shutdown();
}


TEST_CASE("PipelineHost merges errors by source and stamps ids per entry (Aurora-ja76)", "[PipelineHost]")
{
  ScopedTempDir dir("host-error-merge");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  REQUIRE_FALSE(host.reload(registry, bad, dir.path, error));
  const std::uint64_t reloadId = host.status().errors[0].id;

  // An unrelated source keeps the reload entry, and its id.
  REQUIRE(host.setError("audio_permission", "denied"));
  HostStatus status = host.status();
  REQUIRE(status.errors.size() == 2);
  CHECK(status.errors[0].source == "reload");
  CHECK(status.errors[0].id == reloadId);
  CHECK(status.errors[1].source == "audio_permission");
  const std::uint64_t audioId = status.errors[1].id;
  CHECK(audioId > reloadId);

  // The same failure again replaces its entry with a new id, message unchanged.
  REQUIRE_FALSE(host.reload(registry, bad, dir.path, error));
  status = host.status();
  REQUIRE(status.errors.size() == 2);
  const auto reloadEntry = std::find_if(status.errors.begin(), status.errors.end(), [](const HostError& e){ return e.source == "reload"; });
  REQUIRE(reloadEntry != status.errors.end());
  CHECK(reloadEntry->id > audioId);
  const auto audioEntry = std::find_if(status.errors.begin(), status.errors.end(), [](const HostError& e){ return e.source == "audio_permission"; });
  REQUIRE(audioEntry != status.errors.end());
  CHECK(audioEntry->id == audioId);

  CHECK(host.removeError("audio_permission"));
  CHECK_FALSE(host.removeError("audio_permission"));
  status = host.status();
  REQUIRE(status.errors.size() == 1);
  CHECK(status.errors[0].source == "reload");
  host.shutdown();
}


TEST_CASE("PipelineHost::dismissError removes on a matching id only while running (Aurora-ja76)", "[PipelineHost]")
{
  ScopedTempDir dir("host-dismiss");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  using Result = PipelineHost::DismissResult;

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  REQUIRE_FALSE(host.reload(registry, bad, dir.path, error));
  const std::uint64_t staleId = host.status().errors[0].id;
  REQUIRE_FALSE(host.reload(registry, bad, dir.path, error));  // a new failure, a new id
  const std::uint64_t currentId = host.status().errors[0].id;
  REQUIRE(currentId != staleId);

  CHECK(host.dismissError("reload", staleId) == Result::Stale);
  CHECK(host.dismissError("audio_permission", currentId) == Result::Stale);
  CHECK(host.status().errors.size() == 1);

  CHECK(host.dismissError("reload", currentId) == Result::Removed);
  CHECK(host.status().errors.empty());
  CHECK(host.status().state == HostState::Running);
  CHECK(host.dismissError("reload", currentId) == Result::Stale);

  // Paused with a failed resume: the row is the reason, so it stays.
  REQUIRE(host.pause());
  REQUIRE_FALSE(host.resume(registry, bad, dir.path, error));
  const std::uint64_t resumeId = host.status().errors[0].id;
  CHECK(host.dismissError("resume", resumeId) == Result::NotRunning);
  CHECK(host.status().errors.size() == 1);
  host.shutdown();

  // Failed host: same.
  PipelineHost failed(nullptr, {}, buildFailure(registry, dir.path));
  REQUIRE(failed.status().state == HostState::Failed);
  CHECK(failed.dismissError("startup", failed.status().errors[0].id) == Result::NotRunning);
  CHECK(failed.status().errors.size() == 1);
}


TEST_CASE("A failed retry on a failed host replaces the startup error with one reload row (Aurora-ja76)", "[PipelineHost]")
{
  ScopedTempDir dir("host-failed-retry");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {}, buildFailure(registry, dir.path));
  REQUIRE(host.status().errors.size() == 1);

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.reload(registry, bad, dir.path, error));
  HostStatus status = host.status();
  CHECK(status.state == HostState::Failed);
  REQUIRE(status.errors.size() == 1);
  CHECK(status.errors[0].source == "reload");
  host.shutdown();
}


TEST_CASE("A reload failure that lands after a concurrent successful build stores nothing (Aurora-d3ec)", "[PipelineHost]")
{
  ScopedTempDir dir("host-late-failure");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  // The failing build inits its outputs before it fails on the unknown
  // input; a second reload succeeds inside that window.
  bool nested = false;
  events->onOutputInit = [&]{
    if(nested){ return; }
    nested = true;
    std::string innerError;
    REQUIRE(host.reload(registry, videoConfig(), dir.path, innerError));
  };

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  CHECK_FALSE(host.reload(registry, bad, dir.path, error));
  CHECK(error == "Unknown input 'nope'");
  CHECK(host.status().state == HostState::Running);
  CHECK(host.status().errors.empty());
  host.shutdown();
}


TEST_CASE("PipelineHost::status answers while a resume is blocked in its build (Aurora-d3ec)", "[PipelineHost]")
{
  ScopedTempDir dir("host-status-lockfree");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  REQUIRE(host.pause());

  std::promise<void> inBuild;
  std::promise<void> release;
  auto released = release.get_future().share();
  bool blocked = false; // the hook fires once per output; block on the first
  events->onOutputInit = [&]{
    if(blocked){ return; }
    blocked = true;
    inBuild.set_value();
    released.wait();
  };

  std::string error;
  std::thread resumer([&]{ host.resume(registry, videoConfig(), dir.path, error); });
  REQUIRE(inBuild.get_future().wait_for(5s) == std::future_status::ready);

  auto polled = std::async(std::launch::async, [&]{ return host.status(); });
  const bool answered = polled.wait_for(2s) == std::future_status::ready;

  // Release before asserting, so a regression fails cleanly instead of
  // leaving the resume thread blocked.
  release.set_value();
  resumer.join();
  CHECK(answered);
  CHECK(polled.get().state == HostState::Paused);
  CHECK(host.status().state == HostState::Running);
  host.shutdown();
}


TEST_CASE("PUT /api/state on a failed host: running:true retries, running:false has nothing to pause (Aurora-d3ec)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("state-route-failed");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {}, buildFailure(registry, dir.path));
  REQUIRE(host.status().state == HostState::Failed);

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto put = [&](const std::string& body){ return client.Put("/api/state", body, "application/json"); };
  auto get = [&](){
    auto result = getWithRetry(client, "/api/state");
    REQUIRE(result);
    return nlohmann::json::parse(result->body);
  };

  auto shown = get();
  CHECK(shown["state"] == "failed");
  CHECK(shown["paused"] == false);
  REQUIRE(shown["errors"].size() == 1);
  CHECK(shown["errors"][0]["source"] == "startup");
  CHECK(shown["errors"][0]["message"] == "Unknown input 'nope'");
  CHECK(shown["errors"][0]["id"].get<std::uint64_t>() > 0);

  auto nothing = put(R"({"running":false})");
  REQUIRE(nothing);
  CHECK(nothing->status == 409);
  CHECK(nlohmann::json::parse(nothing->body)["succeeded"] == false);
  CHECK(nlohmann::json::parse(nothing->body)["error"] == "nothing_to_pause");

  // The config on disk still names a missing input: the retry fails again,
  // and the error is now the reload's.
  Config broken;
  broken.setActiveInputName("nope");
  ConfigStore(dir.path).save(broken);
  auto failedRetry = put(R"({"running":true})");
  REQUIRE(failedRetry);
  CHECK(failedRetry->status == 500);
  CHECK(nlohmann::json::parse(failedRetry->body)["code"] == "set_running_failed");
  CHECK(nlohmann::json::parse(failedRetry->body)["message"] == "Unknown input 'nope'");
  CHECK(get()["state"] == "failed");
  CHECK(get()["errors"][0]["source"] == "reload");

  ConfigStore(dir.path).save(videoConfig());
  auto retried = put(R"({"running":true})");
  REQUIRE(retried);
  CHECK(retried->status == 200);
  CHECK(nlohmann::json::parse(retried->body) == nlohmann::json{{"succeeded", true}, {"running", true}, {"state", "running"}});
  CHECK(get()["errors"].empty());

  server.stop();
  serverThread.join();
  host.shutdown();
}


TEST_CASE("POST /api/state/dismiss removes a running host's held error by source and id (Aurora-ja76)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("state-route-dismiss");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  Config bad;
  bad.setActiveInputName("nope");
  std::string error;
  REQUIRE_FALSE(host.reload(registry, bad, dir.path, error));

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto get = [&](){
    auto result = getWithRetry(client, "/api/state");
    REQUIRE(result);
    return nlohmann::json::parse(result->body);
  };
  auto dismiss = [&](const std::string& body){ return client.Post("/api/state/dismiss", body, "application/json"); };

  auto shown = get();
  CHECK(shown["state"] == "running");
  REQUIRE(shown["errors"].size() == 1);
  const std::uint64_t id = shown["errors"][0]["id"].get<std::uint64_t>();

  auto bad400 = dismiss(R"({"source":"reload"})");
  REQUIRE(bad400);
  CHECK(bad400->status == 400);

  auto stale = dismiss(nlohmann::json{{"source", "reload"}, {"id", id + 100}}.dump());
  REQUIRE(stale);
  CHECK(stale->status == 200);
  CHECK(nlohmann::json::parse(stale->body) == nlohmann::json{{"succeeded", true}, {"dismissed", false}});
  CHECK(get()["errors"].size() == 1);

  auto removed = dismiss(nlohmann::json{{"source", "reload"}, {"id", id}}.dump());
  REQUIRE(removed);
  CHECK(removed->status == 200);
  CHECK(nlohmann::json::parse(removed->body) == nlohmann::json{{"succeeded", true}, {"dismissed", true}});
  CHECK(get()["errors"].empty());

  REQUIRE(host.pause());
  REQUIRE_FALSE(host.resume(registry, bad, dir.path, error));
  const std::uint64_t resumeId = get()["errors"][0]["id"].get<std::uint64_t>();
  auto refused = dismiss(nlohmann::json{{"source", "resume"}, {"id", resumeId}}.dump());
  REQUIRE(refused);
  CHECK(refused->status == 409);
  CHECK(nlohmann::json::parse(refused->body)["succeeded"] == false);
  CHECK(nlohmann::json::parse(refused->body)["error"] == "not_running");
  CHECK(get()["errors"].size() == 1);

  server.stop();
  serverThread.join();
  host.shutdown();
}


TEST_CASE("PUT /api/state on an idle host: running:true is a no-op, running:false has nothing to pause (Aurora-d3ec)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("state-route-idle");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto put = [&](const std::string& body){ return client.Put("/api/state", body, "application/json"); };

  auto run = put(R"({"running":true})");
  REQUIRE(run);
  CHECK(run->status == 200);
  CHECK(nlohmann::json::parse(run->body) == nlohmann::json{{"succeeded", true}, {"running", false}, {"state", "idle"}});

  auto pause = put(R"({"running":false})");
  REQUIRE(pause);
  CHECK(pause->status == 409);

  server.stop();
  serverThread.join();
}


TEST_CASE("PUT /api/zones answers 409 while paused and GET still lists zones (Aurora-3ddb)", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("zones-paused");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  HttpServer server;
  registerZoneRoutes(
    server,
    [&host]{ return host.listZones(); },
    [&host](std::uint8_t id, const auto& uvs, const auto& active, const auto& gamma){
      return host.updateZone(id, uvs, active, gamma);
    },
    [&host]{ return host.isPaused(); }
  );
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto live = getWithRetry(client, "/api/zones");
  REQUIRE(live);
  auto liveJson = nlohmann::json::parse(live->body);

  REQUIRE(host.pause());
  auto paused = client.Get("/api/zones");
  REQUIRE(paused);
  CHECK(paused->status == 200);
  CHECK(nlohmann::json::parse(paused->body) == liveJson);

  auto edit = client.Put("/api/zones", R"({"zoneId":1,"active":false})", "application/json");
  REQUIRE(edit);
  CHECK(edit->status == 409);
  CHECK(nlohmann::json::parse(edit->body)["error"] == "paused");

  server.stop();
  serverThread.join();
}


TEST_CASE("Concurrent settings PUTs coalesce reloads and none is lost (Aurora-d6i7, Aurora-5ipy.8)", "[SettingsRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("settings-put");

  std::atomic<int> inFlight{0};
  std::atomic<int> maxInFlight{0};
  std::atomic<int> calls{0};
  std::mutex seenMutex;
  std::vector<int> seenRefreshRates;

  HttpServer server;
  registerSettingsRoutes(server, dir.path, std::make_shared<ReloadCoalescer>([&]() -> std::string{
    int now = ++inFlight;
    int seen = maxInFlight.load();
    while(now > seen && !maxInFlight.compare_exchange_weak(seen, now)){}
    int rate = ConfigStore(dir.path).load().refreshRate();
    std::this_thread::sleep_for(20ms); // a slow reload, the case that matters
    --inFlight;
    ++calls;
    std::lock_guard<std::mutex> seenLock(seenMutex);
    seenRefreshRates.push_back(rate);
    return {};
  }));
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  // Each PUT patches a different field, so a lost update shows as a field
  // snapping back to its default.
  const std::vector<std::pair<std::string, nlohmann::json>> patches{
    {"refreshRate", 45},
    {"subsampleWidth", 80},
    {"transitionSmoothing", 0.5},
    {"audioDynamismFloor", 0.3},
    {"audioVibrancyValue", 0.7},
    {"audioReferenceRms", 0.6},
    {"audioBrightnessFloor", 0.5},
    {"audioCentroidStrength", 0.4},
  };

  {
    httplib::Client probe("127.0.0.1", port);
    REQUIRE(getWithRetry(probe, "/api/config"));
  }

  // Catch2's assertions aren't thread-safe here, so the client threads only
  // count successes and the checks run on this thread.
  std::atomic<int> succeeded{0};
  std::vector<std::thread> clients;
  for(const auto& [field, value] : patches){
    clients.emplace_back([&, field = field, value = value]{
      httplib::Client client("127.0.0.1", port);
      auto response = client.Put("/api/config", nlohmann::json{{field, value}}.dump(), "application/json");
      if(response && response->status == 200){ ++succeeded; }
    });
  }
  for(auto& client : clients){ client.join(); }

  server.stop();
  serverThread.join();

  CHECK(succeeded == static_cast<int>(patches.size()));
  CHECK(calls >= 1);
  CHECK(calls <= static_cast<int>(patches.size()));
  CHECK(maxInFlight == 1);
  // The final reload ran after every write, so it saw the last config.
  CHECK(seenRefreshRates.back() == 45);

  Config persisted = ConfigStore(dir.path).load();
  CHECK(persisted.refreshRate() == 45);
  CHECK(persisted.subsampleWidth() == 80);
  CHECK(persisted.transitionSmoothing() == Catch::Approx(0.5f));
  CHECK(persisted.audioDynamismFloor() == Catch::Approx(0.3f));
  CHECK(persisted.audioVibrancyValue() == Catch::Approx(0.7f));
  CHECK(persisted.audioReferenceRms() == Catch::Approx(0.6f));
  CHECK(persisted.audioBrightnessFloor() == Catch::Approx(0.5f));
  CHECK(persisted.audioCentroidStrength() == Catch::Approx(0.4f));
}


TEST_CASE("Settings PUTs behind a slow reload coalesce into one pending reload with the last config (Aurora-5ipy.8)", "[SettingsRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("settings-coalesce");

  std::mutex mutex;
  std::condition_variable cv;
  bool firstStarted = false;
  bool releaseFirst = false;
  std::vector<int> seen;

  HttpServer server;
  registerSettingsRoutes(server, dir.path, std::make_shared<ReloadCoalescer>([&]() -> std::string{
    int rate = ConfigStore(dir.path).load().refreshRate();
    std::unique_lock<std::mutex> lock(mutex);
    seen.push_back(rate);
    if(seen.size() == 1){
      firstStarted = true;
      cv.notify_all();
      cv.wait(lock, [&]{ return releaseFirst; });
    }
    return {};
  }));
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });
  {
    httplib::Client probe("127.0.0.1", port);
    REQUIRE(getWithRetry(probe, "/api/config"));
  }

  std::atomic<int> ok{0};
  auto put = [&](int rate){
    httplib::Client client("127.0.0.1", port);
    auto response = client.Put("/api/config", nlohmann::json{{"refreshRate", rate}}.dump(), "application/json");
    if(response && response->status == 200){ ++ok; }
  };

  std::thread first(put, 10);
  {
    std::unique_lock<std::mutex> lock(mutex);
    REQUIRE(cv.wait_for(lock, 5s, [&]{ return firstStarted; }));
  }

  std::vector<std::thread> rest;
  for(int rate : {20, 30, 40}){ rest.emplace_back(put, rate); }
  // Let the three writes land and queue behind the blocked reload.
  for(int i = 0; i < 200 && ConfigStore(dir.path).load().refreshRate() == 10; ++i){
    std::this_thread::sleep_for(10ms);
  }
  std::this_thread::sleep_for(100ms);
  {
    std::lock_guard<std::mutex> lock(mutex);
    releaseFirst = true;
  }
  cv.notify_all();

  first.join();
  for(auto& thread : rest){ thread.join(); }
  server.stop();
  serverThread.join();

  CHECK(ok == 4);
  REQUIRE(seen.size() == 2);
  CHECK(seen[0] == 10);
  CHECK(seen[1] == ConfigStore(dir.path).load().refreshRate());
}


TEST_CASE("A settings PUT and an effect switch landing together share one reload (Aurora-5ipy.39)", "[SettingsRoutes][EffectsRoutes]")
{
  using namespace Aurora::Network::Http::Server;
  ScopedTempDir dir("shared-reload");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  std::mutex mutex;
  std::condition_variable cv;
  bool firstStarted = false;
  bool releaseFirst = false;
  int runs = 0;

  auto reload = std::make_shared<ReloadCoalescer>([&]() -> std::string{
    std::unique_lock<std::mutex> lock(mutex);
    if(++runs == 1){
      firstStarted = true;
      cv.notify_all();
      cv.wait(lock, [&]{ return releaseFirst; });
    }
    return {};
  });

  HttpServer server;
  registerSettingsRoutes(server, dir.path, reload);
  registerEffectsRoutes(server, host, registry, dir.path, reload);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });
  {
    httplib::Client probe("127.0.0.1", port);
    REQUIRE(getWithRetry(probe, "/api/config"));
  }

  std::atomic<int> ok{0};
  auto putConfig = [&](int rate){
    httplib::Client client("127.0.0.1", port);
    auto response = client.Put("/api/config", nlohmann::json{{"refreshRate", rate}}.dump(), "application/json");
    if(response && response->status == 200){ ++ok; }
  };
  auto putEffect = [&]{
    httplib::Client client("127.0.0.1", port);
    auto response = client.Put("/api/effects", nlohmann::json{{"activeEffectId", ""}}.dump(), "application/json");
    if(response && response->status == 200){ ++ok; }
  };

  std::thread first(putConfig, 10);
  {
    std::unique_lock<std::mutex> lock(mutex);
    REQUIRE(cv.wait_for(lock, 5s, [&]{ return firstStarted; }));
  }

  std::thread second(putConfig, 20);
  std::thread third(putEffect);
  // Both requests queue behind the blocked reload.
  for(int i = 0; i < 200 && ConfigStore(dir.path).load().refreshRate() == 10; ++i){
    std::this_thread::sleep_for(10ms);
  }
  std::this_thread::sleep_for(200ms);
  {
    std::lock_guard<std::mutex> lock(mutex);
    releaseFirst = true;
  }
  cv.notify_all();

  first.join();
  second.join();
  third.join();
  server.stop();
  serverThread.join();
  host.shutdown();

  CHECK(ok == 3);
  CHECK(runs == 2);
}


namespace
{
  int initCount(const Events& events, const std::string& output = "out-a")
  {
    return static_cast<int>(std::count(events.lines.begin(), events.lines.end(), "init " + output));
  }


  // Video config with both derived-at-zero fields set, so tuning them is a
  // live change rather than a 0 -> N reload.
  Config tunedVideoConfig()
  {
    Config config = videoConfig();
    config.setRefreshRate(30);
    config.setSubsampleWidth(64);
    return config;
  }
}


TEST_CASE("Pipeline::build holds the post-derivation Config as its apply baseline (Aurora-c0g)", "[Pipeline]")
{
  ScopedTempDir dir("applied-baseline");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);

  auto pipeline = Pipeline::build(registry, videoConfig(), dir.path, {});
  REQUIRE(pipeline);

  // Config left refreshRate unset; the display (30 Hz) filled it in. Diffing
  // a later disk Config against the 0 would read as a change to 0.
  CHECK(pipeline->appliedConfig().refreshRate() == 30);
}


TEST_CASE("PipelineHost::applyConfig applies live-tunable video fields with no reload (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-video");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  std::string error;
  REQUIRE(host.reload(registry, tunedVideoConfig(), dir.path, error));
  REQUIRE(initCount(*events) == 1);
  REQUIRE(events->widthHints == std::vector<unsigned>{64});

  Config next = tunedVideoConfig();
  next.setTransitionSmoothing(0.5f);
  next.setRefreshRate(60);
  next.setSubsampleWidth(96);
  CHECK(host.applyConfig(next));

  CHECK(initCount(*events) == 1);                                    // no output re-init
  CHECK(host.tickIntervalSeconds() == Catch::Approx(1.0 / 60));      // tick loop picks this up
  CHECK(events->widthHints == std::vector<unsigned>{64, 96});        // capture told the new width
  CHECK(events->has("init out-a"));
  CHECK_FALSE(events->has("shutdown out-a replacement"));
}


TEST_CASE("PipelineHost::applyConfig applies brightness live in both modes with no reload (Aurora-5ipy.7)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-brightness");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  std::string error;
  REQUIRE(host.reload(registry, tunedVideoConfig(), dir.path, error));

  Config next = tunedVideoConfig();
  next.setBrightness(0.25f);
  CHECK(host.applyConfig(next));
  CHECK(initCount(*events) == 1);
  CHECK_FALSE(events->has("shutdown out-a replacement"));
  CHECK(planConfigChange(tunedVideoConfig(), next, /*audioMode*/ true) == ChangeAction::Hot);
}


TEST_CASE("PipelineHost::applyConfig leaves the baseline moved so a repeat is a no-op (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-repeat");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  std::string error;
  REQUIRE(host.reload(registry, tunedVideoConfig(), dir.path, error));

  Config next = tunedVideoConfig();
  next.setSubsampleWidth(96);
  REQUIRE(host.applyConfig(next));
  REQUIRE(host.applyConfig(next));

  CHECK(events->widthHints == std::vector<unsigned>{64, 96}); // not told 96 twice
}


TEST_CASE("PipelineHost::applyConfig refuses structural changes and changes nothing (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-structural");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  std::string error;
  REQUIRE(host.reload(registry, tunedVideoConfig(), dir.path, error));

  Config next = tunedVideoConfig();
  next.setActiveOutputNames({"out-b"});
  next.setRefreshRate(60);
  CHECK_FALSE(host.applyConfig(next));

  // The hot field riding along was not applied either.
  CHECK(host.tickIntervalSeconds() == Catch::Approx(1.0 / 30));
}


TEST_CASE("PipelineHost::applyConfig has nothing to apply to without a pipeline (Aurora-c0g)", "[PipelineHost]")
{
  PipelineHost host(nullptr, {});
  CHECK_FALSE(host.applyConfig(tunedVideoConfig()));
}


TEST_CASE("PipelineHost::applyConfig ignores fields the running mode never reads (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-no-effect");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  std::string error;
  REQUIRE(host.reload(registry, tunedVideoConfig(), dir.path, error));

  Config next = tunedVideoConfig();
  next.setAudioVibrancyValue(0.5f);
  next.setNuxCompleted(true);
  CHECK(host.applyConfig(next));
  CHECK(initCount(*events) == 1);
}


#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
TEST_CASE("PipelineHost::applyConfig sends a live audio tuning change to the audio orchestrator (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-audio");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  std::string error;
  REQUIRE(host.reload(registry, audioConfig(), dir.path, error));

  Config next = audioConfig();
  next.setAudioVibrancyValue(0.5f);
  next.setAudioFixedAnchorHue(200.f);
  CHECK(host.applyConfig(next));
  CHECK(initCount(*events) == 1);

  // Video-side fields are not read in audio mode.
  Config videoSide = next;
  videoSide.setTransitionSmoothing(0.5f);
  CHECK(host.applyConfig(videoSide));

  // The audio input changing is structural.
  Config structural = videoSide;
  structural.setActiveAudioInputName("other");
  CHECK_FALSE(host.applyConfig(structural));
}
#endif


TEST_CASE("PipelineHost::applyConfig runs the capture hint outside the pipeline lock (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-hint-lock");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  std::string error;
  REQUIRE(host.reload(registry, tunedVideoConfig(), dir.path, error));

  // The hint can block on the capture API for seconds (Mac SCK). Called under
  // the host lock it would stall another thread's call (a tick or any API
  // route) for that long. The probe runs on its own thread and is joined only
  // after applyConfig returns: if the lock were wrongly held the hook times
  // out and the test fails, instead of the join deadlocking against it.
  std::promise<void> probeDone;
  std::future<void> probeFuture = probeDone.get_future();
  std::thread probe;
  bool lockWasFree = false;
  events->onWidthHint = [&]{
    probe = std::thread([&]{
      host.tickIntervalSeconds();
      probeDone.set_value();
    });
    lockWasFree = probeFuture.wait_for(2s) == std::future_status::ready;
  };

  Config next = tunedVideoConfig();
  next.setSubsampleWidth(96);
  REQUIRE(host.applyConfig(next));
  probe.join();
  CHECK(lockWasFree);
}


TEST_CASE("applyConfigFromDisk applies live-tunable changes and reloads structural ones (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-from-disk");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});
  ConfigStore store(dir.path);

  // No pipeline yet: builds one.
  store.save(tunedVideoConfig());
  CHECK(applyConfigFromDisk(host, registry, dir.path).empty());
  REQUIRE(initCount(*events) == 1);

  // Live-tunable: same pipeline, no re-init.
  store.update([](Config& c){ c.setTransitionSmoothing(0.5f); c.setRefreshRate(60); return true; });
  CHECK(applyConfigFromDisk(host, registry, dir.path).empty());
  CHECK(initCount(*events) == 1);
  CHECK(host.tickIntervalSeconds() == Catch::Approx(1.0 / 60));

  // A save that changes nothing the pipeline reads (the NUX flag): no reload.
  store.update([](Config& c){ c.setNuxCompleted(true); return true; });
  CHECK(applyConfigFromDisk(host, registry, dir.path).empty());
  CHECK(initCount(*events) == 1);

  // Structural: rebuilt, outputs re-initialised.
  store.update([](Config& c){ c.setActiveOutputNames({"out-a"}); return true; });
  CHECK(applyConfigFromDisk(host, registry, dir.path).empty());
  CHECK(initCount(*events) == 2);
  CHECK(events->has("shutdown out-a replacement"));
}


TEST_CASE("A hot-only save after a failed structural reload retries the structural change (Aurora-c0g)", "[PipelineHost]")
{
  ScopedTempDir dir("apply-retry");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});
  ConfigStore store(dir.path);

  store.save(tunedVideoConfig());
  REQUIRE(applyConfigFromDisk(host, registry, dir.path).empty());

  // Disk gets ahead of the running pipeline: the reload fails, the old
  // pipeline keeps running.
  store.update([](Config& c){ c.setActiveInputName("nope"); return true; });
  CHECK(applyConfigFromDisk(host, registry, dir.path) == "Unknown input 'nope'");

  // A later save touching only a hot field must not be applied against a
  // disk baseline that already contains the failed change -- the structural
  // difference from what is running is still there, so it reloads (and
  // fails again, visibly) instead of silently diverging.
  store.update([](Config& c){ c.setTransitionSmoothing(0.5f); return true; });
  CHECK(applyConfigFromDisk(host, registry, dir.path) == "Unknown input 'nope'");

  // Fixing the structural field recovers.
  store.update([](Config& c){ c.setActiveInputName("fake-video"); return true; });
  CHECK(applyConfigFromDisk(host, registry, dir.path).empty());
}


// Dev-only banner-error injection: without AURORA_DEV_ERRORS the routes do
// not exist (404, host untouched); with it, generic errors can be set and
// removed on a running host -- two at once for the banner's collapsed case.
TEST_CASE("POST /api/dev/errors injects and removes generic host errors only when AURORA_DEV_ERRORS is set", "[PipelineRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  // The flag is read once per registerDevErrorsRoute call, so set it
  // explicitly around each registration and restore whatever was there.
  struct ScopedDevErrorsEnv
  {
    explicit ScopedDevErrorsEnv(bool on)
    {
      const char* previous = std::getenv("AURORA_DEV_ERRORS");
      m_hadPrevious = previous != nullptr;
      if(m_hadPrevious){ m_previous = previous; }
      set(on);
    }

    ~ScopedDevErrorsEnv()
    {
      if(m_hadPrevious){ set(true, m_previous.c_str()); }
      else{ set(false); }
    }

    ScopedDevErrorsEnv(const ScopedDevErrorsEnv&) = delete;
    ScopedDevErrorsEnv& operator=(const ScopedDevErrorsEnv&) = delete;

  private:
    static void set(bool on, const char* value = "1")
    {
#ifdef _WIN32
      _putenv(on ? "AURORA_DEV_ERRORS=1" : "AURORA_DEV_ERRORS=");
      if(on && std::string(value) != "1"){ _putenv(("AURORA_DEV_ERRORS=" + std::string(value)).c_str()); }
#else
      if(on){ ::setenv("AURORA_DEV_ERRORS", value, 1); }
      else{ ::unsetenv("AURORA_DEV_ERRORS"); }
#endif
    }

    bool m_hadPrevious{false};
    std::string m_previous;
  };

  auto errorsOf = [&](httplib::Client& client){
    auto result = getWithRetry(client, "/api/state");
    REQUIRE(result);
    return nlohmann::json::parse(result->body);
  };

  // Without the flag the routes do not exist: 404, host untouched.
  {
    ScopedTempDir dir("dev-errors-gated");
    auto events = std::make_shared<Events>();
    auto registry = makeRegistry(events);
    PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

    ScopedDevErrorsEnv env(false);
    Aurora::Network::Http::Server::HttpServer server;
    registerDevErrorsRoute(server, host);
    const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
    std::thread serverThread([&](){ server.listen(); });

    httplib::Client client("127.0.0.1", port);
    auto res = client.Post("/api/dev/errors", R"({"source":"dev-1","message":"boom"})", "application/json");
    REQUIRE(res);
    CHECK(res->status == 404);
    CHECK(host.status().errors.empty());

    server.stop();
    serverThread.join();
    host.shutdown();
  }

  // With the flag: two generic errors coexist on a running host (the
  // banner's collapsed case), and remove clears one.
  {
    ScopedTempDir dir("dev-errors-set");
    auto events = std::make_shared<Events>();
    auto registry = makeRegistry(events);
    PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

    ScopedDevErrorsEnv env(true);
    Aurora::Network::Http::Server::HttpServer server;
    registerStateRoute(server, host, registry, dir.path);
    registerDevErrorsRoute(server, host);
    const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
    std::thread serverThread([&](){ server.listen(); });

    httplib::Client client("127.0.0.1", port);
    auto set = [&](const std::string& source, const std::string& message){
      return client.Post("/api/dev/errors", nlohmann::json{{"source", source}, {"message", message}}.dump(), "application/json");
    };

    auto first = set("dev-1", "first failure");
    REQUIRE(first);
    CHECK(first->status == 200);
    CHECK(nlohmann::json::parse(first->body) == nlohmann::json{{"succeeded", true}});

    auto second = set("dev-2", "second failure");
    REQUIRE(second);
    CHECK(second->status == 200);

    auto shown = errorsOf(client);
    CHECK(shown["state"] == "running");
    REQUIRE(shown["errors"].size() == 2);
    CHECK(shown["errors"][0]["source"] == "dev-1");
    CHECK(shown["errors"][1]["source"] == "dev-2");

    auto bad = client.Post("/api/dev/errors", R"({"source":"dev-3"})", "application/json");
    REQUIRE(bad);
    CHECK(bad->status == 400);
    CHECK(errorsOf(client)["errors"].size() == 2);

    auto remove = [&](const std::string& source){
      return client.Post("/api/dev/errors/remove", nlohmann::json{{"source", source}}.dump(), "application/json");
    };
    auto removed = remove("dev-1");
    REQUIRE(removed);
    CHECK(removed->status == 200);
    CHECK(nlohmann::json::parse(removed->body) == nlohmann::json{{"succeeded", true}, {"removed", true}});
    auto remaining = errorsOf(client);
    REQUIRE(remaining["errors"].size() == 1);
    CHECK(remaining["errors"][0]["source"] == "dev-2");

    auto repeat = remove("dev-1");
    REQUIRE(repeat);
    CHECK(nlohmann::json::parse(repeat->body) == nlohmann::json{{"succeeded", true}, {"removed", false}});

    server.stop();
    serverThread.join();
    host.shutdown();
  }

  // Idle host (no pipeline): set answers 409, like the dismiss route.
  {
    ScopedTempDir dir("dev-errors-idle");
    auto events = std::make_shared<Events>();
    auto registry = makeRegistry(events);
    PipelineHost host(nullptr, {});

    ScopedDevErrorsEnv env(true);
    Aurora::Network::Http::Server::HttpServer server;
    registerDevErrorsRoute(server, host);
    const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
    std::thread serverThread([&](){ server.listen(); });

    httplib::Client client("127.0.0.1", port);
    auto res = client.Post("/api/dev/errors", R"({"source":"dev-1","message":"boom"})", "application/json");
    REQUIRE(res);
    CHECK(res->status == 409);
    CHECK(nlohmann::json::parse(res->body)["succeeded"] == false);
    CHECK(nlohmann::json::parse(res->body)["error"] == "not_running");

    server.stop();
    serverThread.join();
  }
}


TEST_CASE("PipelineHost conditions hold in every host state and survive builds and pause (Aurora-rbp3)", "[PipelineHost]")
{
  ScopedTempDir dir("host-conditions");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});

  // Idle (no pipeline): where setError refuses, a condition still holds.
  CHECK_FALSE(host.setError("local_network", "blocked"));
  host.setCondition("local_network", "blocked");
  REQUIRE(host.conditions().size() == 1);
  CHECK(host.status().errors.empty());

  // Same source replaces, others sit beside it.
  host.setCondition("local_network", "still blocked");
  host.setCondition("other", "x");
  REQUIRE(host.conditions().size() == 2);
  CHECK(host.conditions()[0].message == "still blocked");

  // A successful build clears errors, never conditions; nor does pause.
  std::string error;
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  CHECK(host.conditions().size() == 2);
  REQUIRE(host.pause());
  CHECK(host.conditions().size() == 2);

  CHECK(host.clearCondition("other"));
  CHECK_FALSE(host.clearCondition("other"));
  REQUIRE(host.conditions().size() == 1);
  CHECK(host.conditions()[0].source == "local_network");
  host.shutdown();
}


TEST_CASE("PipelineHost holds the video input's captureError as a video_capture error (Aurora-8u3p)", "[PipelineHost]")
{
  ScopedTempDir dir("host-capture-error");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(nullptr, {});
  std::string error;
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));

  host.tick();
  CHECK(host.status().errors.empty());

  events->captureError = "Screen capture unavailable";
  host.tick();
  auto status = host.status();
  CHECK(status.state == HostState::Running);
  REQUIRE(status.errors.size() == 1);
  CHECK(status.errors[0].source == "video_capture");
  CHECK(status.errors[0].message == "Screen capture unavailable");

  // Dismissed stays dismissed while the same failure persists.
  CHECK(host.dismissError("video_capture", status.errors[0].id) == PipelineHost::DismissResult::Removed);
  host.tick();
  CHECK(host.status().errors.empty());

  // Recovery and recurrence re-raise it; recovery alone clears it.
  events->captureError.clear();
  host.tick();
  events->captureError = "Screen capture unavailable";
  host.tick();
  REQUIRE(host.status().errors.size() == 1);
  events->captureError.clear();
  host.tick();
  CHECK(host.status().errors.empty());

  // A rebuild forgets the held message, so a standing failure shows again.
  events->captureError = "Screen capture unavailable";
  host.tick();
  REQUIRE(host.reload(registry, videoConfig(), dir.path, error));
  CHECK(host.status().errors.empty());
  host.tick();
  CHECK(host.status().errors.size() == 1);
  host.shutdown();
}


TEST_CASE("registerAllNodes gates audio nodes on includeAudio (Aurora-id8j.11)", "[GraphRoutes]")
{
  Aurora::Runtime::Graph::NodeRegistry withAudio, withoutAudio;
  Aurora::Runtime::Graph::registerAllNodes(withAudio, true);
  Aurora::Runtime::Graph::registerAllNodes(withoutAudio, false);
  CHECK(withoutAudio.find("audio.capture") == nullptr);
  CHECK(withoutAudio.find("video.capture") != nullptr);
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
  CHECK(withAudio.find("audio.capture") != nullptr);
#endif
}


TEST_CASE("GET /api/nodes serves every registered node and rejects a forged Host (Aurora-id8j.2)", "[GraphRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  Aurora::Runtime::Graph::NodeRegistry expected;
  Aurora::Runtime::Graph::registerAllNodes(expected, true);

  HttpServer server;
  registerNodesRoute(server);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto res = client.Get("/api/nodes");
  REQUIRE(res);
  CHECK(res->status == 200);

  auto nodes = nlohmann::json::parse(res->body)["nodes"];
  auto types = expected.types();
  REQUIRE(nodes.size() == types.size());
  for(size_t i = 0; i < types.size(); ++i){
    const auto& node = nodes[i];
    CHECK(node["type"] == types[i]);
    for(const char* key : {"purpose", "useWhen", "example", "cost"}){
      CHECK_FALSE(node[key].get<std::string>().empty());
    }
    CHECK(node["inputs"].is_array());
    CHECK(node["outputs"].is_array());
    CHECK(node["params"].size() == expected.find(types[i])->params.size());
  }

  // Spot-check the shapes an editor reads: a ported node, a float param
  // with its schema, an enum's options.
  auto find = [&](const std::string& type) -> const nlohmann::json& {
    for(const auto& node : nodes){
      if(node["type"] == type){ return node; }
    }
    FAIL("missing node type " << type);
    return nodes[0];
  };
  const auto& send = find("output.send");
  CHECK(send["inputs"][0].contains("required"));
  CHECK_FALSE(send["outputs"].size() > 0);

  bool sawFloat = false, sawEnum = false;
  for(const auto& node : nodes){
    for(const auto& param : node["params"]){
      if(param["kind"] == "float"){
        sawFloat = true;
        for(const char* key : {"label", "min", "max", "step", "unit", "default", "allowsUnset"}){
          CHECK(param.contains(key));
        }
      }
      if(param["kind"] == "enum"){
        sawEnum = true;
        CHECK(param["options"].is_array());
        // Per-output binding params have no static options.
        if(!param["options"].empty()){
          CHECK(std::find(param["options"].begin(), param["options"].end(), param["default"]) != param["options"].end());
        }
      }
    }
  }
  CHECK(sawFloat);
  CHECK(sawEnum);

  auto forged = client.Get("/api/nodes", {{"Host", "evil.com"}});
  REQUIRE(forged);
  CHECK(forged->status == 403);

  server.stop();
  serverThread.join();
}


TEST_CASE("Preset routes fill the user's outputs and every preset validates with Tuning controls (Aurora-4xqt.8)", "[Presets]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("preset-routes");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  Config config = videoConfig();
  config.setActiveOutputNames({"out-a", "out-b"});
  ConfigStore(dir.path).save(config);

  HttpServer server;
  registerPresetRoutes(server, registry, dir.path);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });
  httplib::Client client("127.0.0.1", port);

  auto list = client.Get("/api/graph/presets");
  REQUIRE(list);
  CHECK(list->status == 200);
  const auto presets = nlohmann::json::parse(list->body)["presets"];
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
  REQUIRE(presets.size() == 4);
#else
  REQUIRE(presets.size() == 2);
#endif
  for(const auto& entry : presets){
    CHECK_FALSE(entry["title"].get<std::string>().empty());
    CHECK_FALSE(entry["description"].get<std::string>().empty());
    CHECK_FALSE(entry["controls"].empty());

    auto got = client.Get("/api/graph/presets/" + entry["id"].get<std::string>());
    REQUIRE(got);
    CHECK(got->status == 200);
    const auto body = nlohmann::json::parse(got->body);
    INFO(body["errors"].dump());
    CHECK(body["valid"] == true);
    CHECK(body["outputs"] == nlohmann::json::array({"out-a", "out-b"}));
    CHECK_FALSE(body["graph"]["controls"].empty());
    CHECK(body["graph"]["title"] == entry["title"]);
    CHECK(body["graph"]["minorVersion"] == 1);

    // Every output has a sender, so the user's outputs were filled in.
    int sends = 0;
    for(const auto& node : body["graph"]["nodes"]){
      sends += node["type"] == "output.send" ? 1 : 0;
    }
    CHECK(sends == 2);
  }

  auto missing = client.Get("/api/graph/presets/nope");
  REQUIRE(missing);
  CHECK(missing->status == 404);

  server.stop();
  serverThread.join();
}


TEST_CASE("GET /api/graph serves the running graph, null when none runs (Aurora-id8j.2)", "[GraphRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("graph-route");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  HttpServer server;
  registerGraphRoute(server, host);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  auto res = client.Get("/api/graph");
  REQUIRE(res);
  CHECK(res->status == 200);
  auto graph = nlohmann::json::parse(res->body)["graph"];
  CHECK(graph["version"] == 1);
  CHECK(graph["nodes"].is_array());
  CHECK_FALSE(graph["nodes"].empty());
  CHECK(graph["edges"].is_array());

  auto forged = client.Get("/api/graph", {{"Host", "evil.com"}});
  REQUIRE(forged);
  CHECK(forged->status == 403);

  REQUIRE(host.pause());
  auto paused = client.Get("/api/graph");
  REQUIRE(paused);
  CHECK(paused->status == 200);
  CHECK(nlohmann::json::parse(paused->body)["graph"].is_null());

  host.shutdown();
  server.stop();
  serverThread.join();
}


namespace
{
  // The data payloads of every `event: <topic>` block in an SSE capture.
  std::vector<nlohmann::json> eventsOf(const std::string& capture, const std::string& topic)
  {
    std::vector<nlohmann::json> found;
    const std::string marker = "event: " + topic + "\ndata: ";
    for(size_t at = capture.find(marker); at != std::string::npos; at = capture.find(marker, at + 1)){
      const size_t start = at + marker.size();
      const size_t end = capture.find("\n\n", start);
      if(end == std::string::npos){ break; }
      found.push_back(nlohmann::json::parse(capture.substr(start, end - start)));
    }
    return found;
  }
}


TEST_CASE("GET /api/events opens with the current state and health, then pushes changes (Aurora-5ipy.3)", "[PipelineRoutes][Events]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("events-route");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  registerEventsRoute(server, host, dir.path, 100ms);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", port);
  SseReader reader(port, "/api/events");
  REQUIRE(reader.status() == 200);
  REQUIRE(reader.waitFor("event: health\n"));

  auto polled = client.Get("/api/state");
  REQUIRE(polled);
  const auto firstState = eventsOf(reader.data(), "state");
  REQUIRE(firstState.size() == 1);
  CHECK(firstState[0] == nlohmann::json::parse(polled->body));
  CHECK(firstState[0]["state"] == "running");

  const auto firstHealth = eventsOf(reader.data(), "health");
  REQUIRE(firstHealth.size() == 1);
  CHECK(firstHealth[0] == nlohmann::json{{"errors", nlohmann::json::array()}, {"conditions", nlohmann::json::array()}});

  REQUIRE(host.pause());
  REQUIRE(reader.waitFor("\"state\":\"paused\""));
  const auto afterPause = eventsOf(reader.data(), "state");
  REQUIRE(afterPause.size() == 2);
  CHECK(afterPause[1]["paused"] == true);

  host.setCondition("test", "something is off");
  // The state event lands first, so wait for the health one by count.
  std::vector<nlohmann::json> health;
  for(int attempt = 0; attempt < 100 && health.size() < 2; ++attempt){
    std::this_thread::sleep_for(20ms);
    health = eventsOf(reader.data(), "health");
  }
  REQUIRE(health.size() == 2);
  CHECK(health[1]["conditions"][0]["source"] == "test");

  // The heartbeat keeps an idle stream writing so a dead peer is noticed.
  CHECK(reader.waitFor(": ping\n\n"));

  host.shutdown();
  server.stop();
  serverThread.join();
}


TEST_CASE("GET /api/events honors the topics filter and ignores unknown topics (Aurora-5ipy.3)", "[PipelineRoutes][Events]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("events-topics");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  HttpServer server;
  registerEventsRoute(server, host, dir.path, 100ms);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  SseReader healthOnly(port, "/api/events?topics=health,nonsense");
  REQUIRE(healthOnly.waitFor("event: health\n"));
  host.setCondition("test", "visible");
  REQUIRE(healthOnly.waitFor("visible"));
  CHECK(healthOnly.data().find("event: state") == std::string::npos);

  host.shutdown();
  server.stop();
  serverThread.join();
}


TEST_CASE("GET /api/events streams do not slow other routes under a tick storm (Aurora-5ipy.3)", "[PipelineRoutes][Events]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("events-latency");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  HttpServer server;
  registerStateRoute(server, host, registry, dir.path);
  registerEventsRoute(server, host, dir.path, 100ms);
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });

  std::vector<std::unique_ptr<SseReader>> readers;
  for(int i = 0; i < 3; ++i){
    readers.push_back(std::make_unique<SseReader>(port, "/api/events"));
    REQUIRE(readers.back()->waitFor("event: state\n"));
  }

  // Back-to-back ticks, as a refresh rate far above what the host can serve.
  std::atomic<bool> ticking{true};
  std::thread tickThread([&](){ while(ticking.load()){ host.tick(); } });

  httplib::Client client("127.0.0.1", port);
  std::chrono::milliseconds slowest{0};
  for(int i = 0; i < 20; ++i){
    const auto started = std::chrono::steady_clock::now();
    auto polled = client.Get("/api/state");
    slowest = std::max(slowest, std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started));
    REQUIRE(polled);
    CHECK(polled->status == 200);
  }
  CHECK(slowest < 500ms);

  ticking.store(false);
  tickThread.join();
  host.shutdown();
  server.stop();
  serverThread.join();
}


TEST_CASE("nextTickTime keeps the interval on time and forces a yield on overrun (Aurora-cgr)", "[TickClock]")
{
  using Clock = std::chrono::steady_clock;
  const Clock::time_point start{};

  CHECK(MinTickYield >= 1ms);

  // On time: wakes one interval after the tick started.
  CHECK(nextTickTime(start, 1.0 / 60, start + 2ms) == start + std::chrono::duration_cast<Clock::duration>(std::chrono::duration<double>(1.0 / 60)));

  // Overran the interval, or a rate far above what the host serves: still sleeps the minimum.
  CHECK(nextTickTime(start, 1.0 / 60, start + 30ms) >= start + 31ms);
  CHECK(nextTickTime(start, 1.0 / 1000, start + 1500us) >= start + 2500us);
  CHECK(nextTickTime(start, 0.0, start + 5ms) >= start + 6ms);
}


TEST_CASE("A tick loop at an extreme rate leaves other host calls inside a latency budget (Aurora-cgr)", "[PipelineHost][TickClock]")
{
  ScopedTempDir dir("tick-starvation");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(videoConfig());
  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});

  // A grab that costs 1 ms, as on hardware, and the app loop with a zero
  // interval: every tick overruns and re-enters at once.
  events->onGrab = []{
    const auto until = std::chrono::steady_clock::now() + 1ms;
    while(std::chrono::steady_clock::now() < until){}
  };
  std::atomic<bool> ticking{true};
  std::thread tickThread([&](){
    while(ticking.load()){
      const auto tickStart = std::chrono::steady_clock::now();
      const double interval = host.tick() * 0.0;
      std::this_thread::sleep_until(nextTickTime(tickStart, interval, std::chrono::steady_clock::now()));
    }
  });

  std::chrono::milliseconds slowest{0};
  for(int i = 0; i < 50; ++i){
    const auto started = std::chrono::steady_clock::now();
    host.listMonitors();
    host.listZones();
    slowest = std::max(slowest, std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started));
  }
  CHECK(slowest < 250ms);

  ticking.store(false);
  tickThread.join();
  host.shutdown();
}


TEST_CASE("EffectStore round-trips graph files and refuses ids that could leave effects/ (Aurora-52oz.1)", "[Effects]")
{
  ScopedTempDir dir("effect-store");
  EffectStore store(dir.path);
  CHECK(store.list().empty());

  const nlohmann::json doc = Graph::builtInVideoGraph({"out-a"});
  std::string error;
  REQUIRE(store.write("calm-1", doc, error));
  REQUIRE(store.write("alpha", doc, error));
  CHECK(store.list() == std::vector<std::string>{"alpha", "calm-1"});
  CHECK(store.exists("alpha"));

  auto back = store.read("calm-1", error);
  REQUIRE(back);
  CHECK(*back == doc);

  CHECK_FALSE(store.write("../escape", doc, error));
  CHECK_FALSE(store.write("builtin.video", doc, error));
  CHECK_FALSE(store.write("Upper", doc, error));
  CHECK_FALSE(store.write("", doc, error));
  CHECK_FALSE(store.read("missing", error));
  CHECK(error.find("missing") != std::string::npos);

  std::ofstream(dir.path / "effects" / "broken.json") << "{not json";
  CHECK_FALSE(store.read("broken", error));
  CHECK(error.find("not valid JSON") != std::string::npos);

  CHECK(store.remove("alpha"));
  CHECK_FALSE(store.remove("alpha"));
  CHECK(store.list() == std::vector<std::string>{"broken", "calm-1"});
}


TEST_CASE("A custom effect runs, and a failed one falls back with a held effect_fallback error (Aurora-52oz.1)", "[Effects]")
{
  ScopedTempDir dir("effect-fallback");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  std::string error;
  EffectStore store(dir.path);
  REQUIRE(store.write("mine", Graph::builtInVideoGraph({"out-a", "out-b"}), error));
  REQUIRE(store.write("gone-output", Graph::builtInVideoGraph({"removed-out"}), error));
  std::ofstream(dir.path / "effects" / "broken.json") << "{not json";

  PipelineHost host(nullptr, {});
  auto effectsOf = [&](){
    const PipelineSummary summary = host.summary();
    return std::make_pair(summary.effect, summary.requestedEffect);
  };
  auto reloadWith = [&](const std::string& id){
    Config config = videoConfig();
    config.setActiveEffectId(id);
    return host.reload(registry, config, dir.path, error);
  };

  REQUIRE(reloadWith("mine"));
  CHECK(effectsOf() == std::make_pair(std::string("mine"), std::string("mine")));
  CHECK(host.status().errors.empty());
  CHECK(*host.graphJson() == Graph::builtInVideoGraph({"out-a", "out-b"}));

  // A custom naming a removed output runs the built-in and holds the entry.
  REQUIRE(reloadWith("gone-output"));
  CHECK(effectsOf() == std::make_pair(std::string("builtin.video"), std::string("gone-output")));
  HostStatus status = host.status();
  CHECK(status.state == HostState::Running);
  REQUIRE(status.errors.size() == 1);
  CHECK(status.errors[0].source == "effect_fallback");
  CHECK(status.errors[0].message.find("removed-out") != std::string::npos);

  // A missing file and a corrupt one fall back the same way.
  REQUIRE(reloadWith("not-there"));
  CHECK(effectsOf().first == "builtin.video");
  REQUIRE(host.status().errors.size() == 1);
  CHECK(host.status().errors[0].message.find("missing") != std::string::npos);
  REQUIRE(reloadWith("broken"));
  REQUIRE(host.status().errors.size() == 1);
  CHECK(host.status().errors[0].message.find("not valid JSON") != std::string::npos);

  // The entry clears once the custom loads, and when the user switches away.
  REQUIRE(reloadWith("mine"));
  CHECK(host.status().errors.empty());
  REQUIRE(reloadWith("gone-output"));
  REQUIRE(host.status().errors.size() == 1);
  REQUIRE(reloadWith("builtin.video"));
  CHECK(host.status().errors.empty());
  CHECK(effectsOf() == std::make_pair(std::string("builtin.video"), std::string("builtin.video")));

  // Resuming from pause onto a failing custom holds the entry too.
  REQUIRE(reloadWith("mine"));
  REQUIRE(host.pause());
  Config config = videoConfig();
  config.setActiveEffectId("gone-output");
  REQUIRE(host.resume(registry, config, dir.path, error));
  REQUIRE(host.status().errors.size() == 1);
  CHECK(host.status().errors[0].source == "effect_fallback");
  host.shutdown();
}


TEST_CASE("A startup pipeline that fell back holds the effect_fallback error (Aurora-52oz.1)", "[Effects]")
{
  ScopedTempDir dir("effect-fallback-startup");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  Config config = videoConfig();
  config.setActiveEffectId("nope");

  PipelineHost host(Pipeline::build(registry, config, dir.path, {}), {});
  REQUIRE(host.status().errors.size() == 1);
  CHECK(host.status().errors[0].source == "effect_fallback");
  CHECK(host.summary().requestedEffect == "nope");
  host.shutdown();
}


TEST_CASE("Switching between built-in effect ids does not rebuild the pipeline (Aurora-52oz.1)", "[Effects][ConfigApply]")
{
  Config applied = videoConfig();
  Config next = videoConfig();
  next.setActiveEffectId("builtin.video");
  CHECK(planConfigChange(applied, next, false) == ChangeAction::None);

  next.setActiveEffectId("mine");
  CHECK(planConfigChange(applied, next, false) == ChangeAction::Reload);
  CHECK(planConfigChange(next, applied, false) == ChangeAction::Reload);
}


TEST_CASE("Effects routes list, read, switch and delete (Aurora-52oz.1)", "[Effects]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("effects-routes");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  std::string error;
  EffectStore store(dir.path);
  nlohmann::json mine = Graph::builtInVideoGraph({"out-a", "out-b"});
  mine["title"] = "Mine";
  mine["description"] = "My own effect.";
  REQUIRE(store.write("mine", mine, error));
  std::ofstream(dir.path / "effects" / "broken.json") << "{not json";
  ConfigStore(dir.path).save(videoConfig());

  PipelineHost host(Pipeline::build(registry, videoConfig(), dir.path, {}), {});
  HttpServer server;
  registerEffectsRoutes(server, host, registry, dir.path, std::make_shared<ReloadCoalescer>([&]{
    return applyConfigFromDisk(host, registry, dir.path);
  }));
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });
  httplib::Client client("127.0.0.1", port);

  auto json = [](const httplib::Result& result){
    REQUIRE(result);
    return nlohmann::json::parse(result->body);
  };

  auto list = json(getWithRetry(client, "/api/effects"));
  CHECK(list["effects"] == nlohmann::json::array({
    {{"id", "builtin.video"}, {"builtin", true}, {"title", "Screen colors"},
      {"description", "Follows the colors on your screen."}},
    {{"id", "builtin.audio"}, {"builtin", true}, {"title", "Music pulse"},
      {"description", "Moves with the sound your computer is playing."}},
    {{"id", "broken"}, {"builtin", false}, {"title", "broken"}, {"description", nullptr}},
    {{"id", "mine"}, {"builtin", false}, {"title", "Mine"}, {"description", "My own effect."}}
  }));
  CHECK(list["activeEffectId"] == "");
  CHECK(list["effect"] == "builtin.video");

  auto one = getWithRetry(client, "/api/effects/mine");
  REQUIRE(one);
  CHECK(nlohmann::json::parse(one->body) == nlohmann::json{{"id", "mine"}, {"builtin", false}, {"graph", mine}});
  auto builtIn = json(getWithRetry(client, "/api/effects/builtin.video"));
  CHECK(builtIn["builtin"] == true);
  CHECK(builtIn["graph"]["nodes"].is_array());
  CHECK(getWithRetry(client, "/api/effects/nope")->status == 404);
  CHECK(getWithRetry(client, "/api/effects/broken")->status == 422);

  // Switch to the custom and back.
  auto put = [&](const std::string& body){ return client.Put("/api/effects", body, "application/json"); };
  auto switched = put(R"({"activeEffectId": "mine"})");
  REQUIRE(switched);
  CHECK(switched->status == 200);
  auto switchedBody = nlohmann::json::parse(switched->body);
  CHECK(switchedBody["effect"] == "mine");
  CHECK(switchedBody["requestedEffect"] == "mine");
  CHECK(ConfigStore(dir.path).load().activeEffectId() == "mine");

  CHECK(put(R"({"activeEffectId": "nope"})")->status == 404);
  CHECK(put(R"({"other": 1})")->status == 400);
  CHECK(ConfigStore(dir.path).load().activeEffectId() == "mine");

  auto back = json(put(R"({"activeEffectId": "builtin.video"})"));
  CHECK(back["effect"] == "builtin.video");
  CHECK(back["requestedEffect"] == "builtin.video");

  // Only an MCP-marked switch to a custom effect records mcpEffectId (Aurora-4xqt.2).
  CHECK(ConfigStore(dir.path).load().mcpEffectId().empty());
  const httplib::Headers mcp{{"X-Aurora-Client", "MCP"}};
  REQUIRE(client.Put("/api/effects", mcp, R"({"activeEffectId": "builtin.video"})", "application/json")->status == 200);
  CHECK(ConfigStore(dir.path).load().mcpEffectId().empty());
  REQUIRE(client.Put("/api/effects", mcp, R"({"activeEffectId": "mine"})", "application/json")->status == 200);
  CHECK(ConfigStore(dir.path).load().mcpEffectId() == "mine");
  REQUIRE(put(R"({"activeEffectId": "builtin.video"})")->status == 200);
  CHECK(ConfigStore(dir.path).load().mcpEffectId() == "mine");

  // Deleting the active custom falls back to the built-in.
  REQUIRE(put(R"({"activeEffectId": "mine"})")->status == 200);
  CHECK(client.Delete("/api/effects/builtin.video")->status == 400);
  CHECK(client.Delete("/api/effects/nope")->status == 404);
  auto deleted = client.Delete("/api/effects/mine");
  REQUIRE(deleted);
  CHECK(deleted->status == 200);
  CHECK(nlohmann::json::parse(deleted->body) == nlohmann::json{{"succeeded", true}, {"deleted", "mine"}, {"fellBack", true}});
  CHECK_FALSE(store.exists("mine"));
  CHECK(ConfigStore(dir.path).load().activeEffectId() == "");
  CHECK(ConfigStore(dir.path).load().mcpEffectId().empty());
  CHECK(host.summary().effect == "builtin.video");
  CHECK(host.status().errors.empty());

  // Deleting a custom that is not active leaves the running effect alone.
  auto other = client.Delete("/api/effects/broken");
  CHECK(nlohmann::json::parse(other->body)["fellBack"] == false);

  server.stop();
  serverThread.join();
  host.shutdown();
}


TEST_CASE("Effects routes: reads need read scope, switch needs apply, delete needs admin (Aurora-52oz.1, Aurora-5ipy.21)", "[Effects][Pairing]")
{
  using namespace Aurora::Network::Http::Server;
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service, [](const std::string& addr){ return addr == "127.0.0.1"; });
  addEffectsAccessRules(guard);

  const std::string read = service->mintForTest("viewer", Scope::Read);
  const std::string draft = service->mintForTest("editor", Scope::Draft);
  const std::string apply = service->mintForTest("adapter", Scope::Apply);
  const std::string admin = service->mintForTest("owner", Scope::Admin);

  auto decide = [&](HttpMethod method, const std::string& path, const std::string& token){
    AccessRequest request;
    request.method = method;
    request.path = path;
    request.remoteAddr = "192.168.1.20";
    if(!token.empty()){ request.authorization = "Bearer " + token; }
    return guard.decide(request).result;
  };
  using Result = AccessDecision::Result;

  for(const char* path : {"/api/effects", "/api/effects/mine"}){
    CHECK(decide(HttpMethod::Get, path, read) == Result::Allow);
    CHECK(decide(HttpMethod::Get, path, "") == Result::Unauthorized);
  }
  CHECK(decide(HttpMethod::Put, "/api/effects", read) == Result::Forbidden);
  CHECK(decide(HttpMethod::Put, "/api/effects", draft) == Result::Forbidden);
  CHECK(decide(HttpMethod::Put, "/api/effects", apply) == Result::Allow);
  CHECK(decide(HttpMethod::Delete, "/api/effects/mine", read) == Result::Forbidden);
  CHECK(decide(HttpMethod::Delete, "/api/effects/mine", draft) == Result::Forbidden);
  CHECK(decide(HttpMethod::Delete, "/api/effects/mine", apply) == Result::Forbidden);
  CHECK(decide(HttpMethod::Delete, "/api/effects/mine", admin) == Result::Allow);
  CHECK(decide(HttpMethod::Put, "/api/effects/mine/params", draft) == Result::Forbidden);
  CHECK(decide(HttpMethod::Put, "/api/effects/mine/params", apply) == Result::Allow);
  CHECK(decide(HttpMethod::Put, "/api/effects", "") == Result::Unauthorized);

  // Config writes stay admin: the apply scope switches through /api/effects.
  CHECK(decide(HttpMethod::Put, "/api/config", apply) == Result::Forbidden);
}


TEST_CASE("The summary reports a custom graph's declared inputs, null for a built-in (Aurora-tc8w)", "[Effects]")
{
  ScopedTempDir dir("effect-graph-inputs");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  std::string error;

  EffectStore store(dir.path);
  REQUIRE(store.write("video-only", Graph::builtInVideoGraph({"out-a", "out-b"}), error));

  Config config = videoConfig();
  auto builtIn = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(builtIn);
  REQUIRE(builtIn->summary().graphInputs);
  CHECK(builtIn->summary().graphInputs->video);
  CHECK_FALSE(builtIn->summary().graphInputs->audio);

  config.setActiveEffectId("video-only");
  auto video = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(video);
  REQUIRE(video->summary().graphInputs);
  CHECK(video->summary().graphInputs->video);
  CHECK_FALSE(video->summary().graphInputs->audio);
}


#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
TEST_CASE("A custom graph with both capture nodes builds both inputs, and a missing source falls back (Aurora-52oz.2)", "[Effects][Audio]")
{
  ScopedTempDir dir("effect-both-inputs");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  std::string error;

  nlohmann::json both = Graph::builtInVideoGraph({"out-a", "out-b"});
  both["nodes"].push_back({{"id", "mic"}, {"type", "audio.capture"}, {"params", nlohmann::json::object()}});
  nlohmann::json audioOnly = Graph::builtInAudioGraph({"out-a", "out-b"});
  EffectStore store(dir.path);
  REQUIRE(store.write("both", both, error));
  REQUIRE(store.write("audio-only", audioOnly, error));
  // No capture node: the config's mode stays, and the summary declares no input.
  nlohmann::json sourceless = {
    {"version", 1},
    {"nodes", {
      {{"id", "c"}, {"type", "color.constant"}, {"params", nlohmann::json::object()}},
      {{"id", "all"}, {"type", "frame.broadcast"}, {"params", {{"output", "out-a"}}}},
      {{"id", "send"}, {"type", "output.send"}, {"params", {{"output", "out-a"}}}}}},
    {"edges", nlohmann::json::array({
      nlohmann::json::array({"c.color", "all.color"}), nlohmann::json::array({"all.frame", "send.frame"})})}};
  REQUIRE(store.write("sourceless", sourceless, error));

  Config config = videoConfig();
  config.setActiveAudioInputName("fake-audio");
  config.setActiveEffectId("both");
  auto pipeline = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(pipeline);
  CHECK_FALSE(pipeline->isAudioMode());
  CHECK(pipeline->summary().effect == "both");
  REQUIRE(pipeline->summary().graphInputs);
  CHECK(pipeline->summary().graphInputs->video);
  CHECK(pipeline->summary().graphInputs->audio);
  CHECK(pipeline->capabilities().usesVideoInput);
  CHECK(pipeline->capabilities().usesAudioInput);
  REQUIRE(pipeline->audioInput() != nullptr);
  pipeline->tick(static_cast<float>(pipeline->tickIntervalSeconds()));
  CHECK(events->sendCount > 0);

  // An audio-only graph runs in audio mode even with a video input named.
  config.setActiveEffectId("audio-only");
  auto audio = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(audio);
  CHECK(audio->isAudioMode());
  CHECK(audio->summary().effect == "audio-only");
  REQUIRE(audio->summary().graphInputs);
  CHECK_FALSE(audio->summary().graphInputs->video);
  CHECK(audio->summary().graphInputs->audio);

  config.setActiveEffectId("sourceless");
  auto none = Pipeline::build(registry, config, dir.path, {});
  REQUIRE(none);
  CHECK(none->summary().effect == "sourceless");
  REQUIRE(none->summary().graphInputs);
  CHECK_FALSE(none->summary().graphInputs->video);
  CHECK_FALSE(none->summary().graphInputs->audio);

  // A graph needing audio with none configured runs the built-in.
  Config noAudio = videoConfig();
  noAudio.setActiveEffectId("both");
  auto fallback = Pipeline::build(registry, noAudio, dir.path, {});
  REQUIRE(fallback);
  CHECK(fallback->summary().effect == "builtin.video");
  CHECK(fallback->summary().fallbackReason.find("audio input") != std::string::npos);
}
#endif


TEST_CASE("DraftStore keeps one draft per session under caps and evicts idle ones (Aurora-52oz.3)", "[Drafts]")
{
  std::int64_t now = 1000;
  DraftLimits limits;
  limits.maxDrafts = 2;
  limits.maxBytes = 64;
  limits.idleSeconds = 100;
  DraftStore store(limits, [&]{ return now; });
  using Put = DraftStore::PutResult;

  CHECK(store.put("a", {{"x", 1}}) == Put::Saved);
  CHECK(store.put("b", {{"x", 2}}) == Put::Saved);
  CHECK(store.get("a")->at("x") == 1);
  CHECK(store.get("b")->at("x") == 2);

  // Replacing a session's draft is not a new draft, so it fits at the cap.
  CHECK(store.put("a", {{"x", 3}}) == Put::Saved);
  CHECK(store.get("a")->at("x") == 3);
  CHECK(store.put("c", {{"x", 4}}) == Put::TooMany);
  CHECK(store.size() == 2);

  CHECK(store.put("big", nlohmann::json{{"pad", std::string(100, 'x')}}) == Put::TooLarge);
  CHECK(store.put("bad/id", {{"x", 1}}) == Put::InvalidSession);
  CHECK(store.put("", {{"x", 1}}) == Put::InvalidSession);
  CHECK(store.put(std::string(65, 'a'), {{"x", 1}}) == Put::InvalidSession);

  // Reading counts as use: b is polled, a is not.
  now += 60;
  CHECK(store.get("b").has_value());
  now += 60;
  CHECK_FALSE(store.get("a").has_value());
  CHECK(store.get("b").has_value());
  CHECK(store.size() == 1);

  // Eviction frees a slot for a new session.
  CHECK(store.put("c", {{"x", 4}}) == Put::Saved);
  CHECK(store.put("d", {{"x", 5}}) == Put::TooMany);
  CHECK(store.remove("c"));
  CHECK_FALSE(store.remove("c"));
  CHECK(store.put("d", {{"x", 5}}) == Put::Saved);
}


TEST_CASE("Draft routes save invalid drafts, keep sessions apart and validate (Aurora-52oz.3)", "[Drafts]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("draft-routes");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  Config config = videoConfig();
  config.setActiveOutputNames({"out-a"});
  ConfigStore(dir.path).save(config);

  std::atomic<std::int64_t> now{0};
  DraftLimits limits;
  limits.maxDrafts = 2;
  limits.maxBytes = 16 * 1024;
  limits.idleSeconds = 100;
  HttpServer server;
  registerDraftRoutes(server, registry, dir.path, nullptr, limits, [&]{ return now.load(); });
  const int port = server.bindToAnyPort("127.0.0.1");
  REQUIRE(port > 0);
  std::thread serverThread([&](){ server.listen(); });
  httplib::Client client("127.0.0.1", port);

  auto put = [&](const std::string& session, const nlohmann::json& graph){
    return client.Put("/api/graph/drafts/" + session, nlohmann::json{{"graph", graph}}.dump(), "application/json");
  };
  auto body = [](const httplib::Result& result){
    REQUIRE(result);
    return nlohmann::json::parse(result->body);
  };

  const nlohmann::json good = Graph::builtInVideoGraph({"out-a"});
  REQUIRE(good.dump().size() < limits.maxBytes);
  nlohmann::json broken = good;
  broken["nodes"].push_back({{"id", "mystery"}, {"type", "nope.nope"}});
  broken["edges"].push_back({"ghost.out", good["nodes"][0]["id"].get<std::string>() + ".in"});

  // An invalid draft saves and reports each error with its node.
  auto saved = put("agent", broken);
  REQUIRE(saved);
  CHECK(saved->status == 200);
  auto savedBody = nlohmann::json::parse(saved->body);
  CHECK(savedBody["succeeded"] == true);
  CHECK(savedBody["valid"] == false);
  bool mysteryNamed = false;
  for(const auto& error : savedBody["errors"]){
    mysteryNamed = mysteryNamed || (error["node"] == "mystery" &&
      error["message"].get<std::string>().find("nope.nope") != std::string::npos);
  }
  CHECK(mysteryNamed);

  // A second session has its own draft.
  auto editorSaved = body(put("editor", good));
  CHECK(editorSaved["valid"] == true);
  CHECK(editorSaved["errors"].empty());
  CHECK(body(getWithRetry(client, "/api/graph/drafts/agent"))["graph"] == broken);
  auto editorDraft = body(getWithRetry(client, "/api/graph/drafts/editor"));
  CHECK(editorDraft["graph"] == good);
  CHECK(editorDraft["session"] == "editor");
  CHECK(editorDraft["valid"] == true);

  // Overwriting one session leaves the other alone.
  CHECK(body(put("agent", good))["valid"] == true);
  CHECK(body(getWithRetry(client, "/api/graph/drafts/editor"))["graph"] == good);

  // Caps: a third session is refused, an oversize draft is refused.
  CHECK(put("third", good)->status == 429);
  nlohmann::json huge = good;
  huge["pad"] = std::string(limits.maxBytes, 'x');
  CHECK(put("agent", huge)->status == 413);
  CHECK(body(getWithRetry(client, "/api/graph/drafts/agent"))["graph"] == good);

  // Bad session id and bad bodies.
  CHECK(put("bad.id", good)->status == 400);
  CHECK(client.Put("/api/graph/drafts/agent", "{not json", "application/json")->status == 400);
  CHECK(client.Put("/api/graph/drafts/agent", R"({"graph": [1]})", "application/json")->status == 400);
  CHECK(client.Put("/api/graph/drafts/agent", R"({"other": {}})", "application/json")->status == 400);
  CHECK(getWithRetry(client, "/api/graph/drafts/bad.id")->status == 400);
  CHECK(getWithRetry(client, "/api/graph/drafts/nobody")->status == 404);

  // Validate does not store, and checks outputs against the config.
  nlohmann::json wrongOutput = Graph::builtInVideoGraph({"out-b"});
  auto validatedBody = body(client.Post(
    "/api/graph/validate", nlohmann::json{{"graph", wrongOutput}}.dump(), "application/json"));
  CHECK(validatedBody["valid"] == false);
  REQUIRE_FALSE(validatedBody["errors"].empty());
  CHECK(validatedBody["errors"][0]["message"].get<std::string>().find("unregistered output 'out-b'") !=
    std::string::npos);
  CHECK(body(client.Post(
    "/api/graph/validate", nlohmann::json{{"graph", good}}.dump(), "application/json"))["valid"] == true);
  CHECK(client.Post("/api/graph/validate", "nope", "application/json")->status == 400);
  CHECK(getWithRetry(client, "/api/graph/drafts/third")->status == 404);

  // Delete frees the session, and idle drafts go.
  CHECK(client.Delete("/api/graph/drafts/agent")->status == 200);
  CHECK(client.Delete("/api/graph/drafts/agent")->status == 404);
  CHECK(put("third", good)->status == 200);
  now = 500;
  CHECK(getWithRetry(client, "/api/graph/drafts/editor")->status == 404);

  server.stop();
  serverThread.join();
}


TEST_CASE("Draft routes: writes need draft scope, reads need read (Aurora-52oz.3)", "[Drafts][Pairing]")
{
  using namespace Aurora::Network::Http::Server;
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service, [](const std::string& addr){ return addr == "127.0.0.1"; });
  addDraftAccessRules(guard);

  const std::string read = service->mintForTest("viewer", Scope::Read);
  const std::string draft = service->mintForTest("editor", Scope::Draft);
  const std::string apply = service->mintForTest("adapter", Scope::Apply);

  auto decide = [&](HttpMethod method, const std::string& path, const std::string& token,
                    const std::string& addr = "192.168.1.20"){
    AccessRequest request;
    request.method = method;
    request.path = path;
    request.remoteAddr = addr;
    if(!token.empty()){ request.authorization = "Bearer " + token; }
    return guard.decide(request).result;
  };
  using Result = AccessDecision::Result;

  CHECK(decide(HttpMethod::Get, "/api/graph/drafts/s1", read) == Result::Allow);
  CHECK(decide(HttpMethod::Get, "/api/graph/drafts/s1", "") == Result::Unauthorized);
  const std::vector<std::pair<HttpMethod, std::string>> writes{
    {HttpMethod::Put, "/api/graph/drafts/s1"},
    {HttpMethod::Delete, "/api/graph/drafts/s1"},
    {HttpMethod::Post, "/api/graph/validate"}};
  for(const auto& [method, path] : writes){
    CHECK(decide(method, path, read) == Result::Forbidden);
    CHECK(decide(method, path, draft) == Result::Allow);
    CHECK(decide(method, path, apply) == Result::Allow);
    CHECK(decide(method, path, "") == Result::Unauthorized);
    CHECK(decide(method, path, "", "127.0.0.1") == Result::Allow);
  }
}


namespace
{
  // A server with the draft and apply routes over one host, the way the apps
  // wire them.
  struct ApplyHarness
  {
    explicit ApplyHarness(const std::string& name, Config config, const std::string& activeEffect = ""):
    dir(name),
    events(std::make_shared<Events>()),
    registry(makeRegistry(events))
    {
      config.setActiveEffectId(activeEffect);
      ConfigStore(dir.path).save(config);
      host = std::make_unique<PipelineHost>(Pipeline::build(registry, config, dir.path, {}), PipelineOptions{});
      auto drafts = registerDraftRoutes(server, registry, dir.path);
      registerApplyRoutes(server, *host, registry, dir.path, drafts,
        [this]{ return applyEffectFromDisk(*host, registry, dir.path); });
      registerEffectsRoutes(server, *host, registry, dir.path, std::make_shared<ReloadCoalescer>([this]{
        return applyEffectFromDisk(*host, registry, dir.path);
      }));
      const int port = server.bindToAnyPort("127.0.0.1");
      REQUIRE(port > 0);
      serverThread = std::thread([this](){ server.listen(); });
      client = std::make_unique<httplib::Client>("127.0.0.1", port);
    }

    ~ApplyHarness()
    {
      server.stop();
      serverThread.join();
      host->shutdown();
    }

    nlohmann::json putDraft(const std::string& session, const nlohmann::json& graph)
    {
      auto result = client->Put("/api/graph/drafts/" + session, nlohmann::json{{"graph", graph}}.dump(), "application/json");
      REQUIRE(result);
      return nlohmann::json::parse(result->body);
    }

    httplib::Result apply(const nlohmann::json& body)
    {
      return client->Post("/api/graph/apply", body.dump(), "application/json");
    }

    httplib::Result save(const nlohmann::json& body)
    {
      return client->Post("/api/graph/save", body.dump(), "application/json");
    }

    httplib::Result duplicate(const std::string& source, const nlohmann::json& body)
    {
      return client->Post("/api/effects/" + source + "/duplicate", body.dump(), "application/json");
    }

    ScopedTempDir dir;
    std::shared_ptr<Events> events;
    Registry registry;
    std::unique_ptr<PipelineHost> host;
    Aurora::Network::Http::Server::HttpServer server;
    std::thread serverThread;
    std::unique_ptr<httplib::Client> client;
  };
}


TEST_CASE("Apply swaps a graph-only change in place, with no output re-init, and it survives restart (Aurora-52oz.4)", "[Apply]")
{
  ApplyHarness h("apply-swap", tunedVideoConfig());
  REQUIRE(initCount(*h.events) == 1);
  CHECK(h.host->summary().effect == "builtin.video");

  // A re-handshake would cost this per output; the swap must not pay it.
  h.events->onOutputInit = []{ std::this_thread::sleep_for(300ms); };

  const nlohmann::json first = Graph::builtInVideoGraph({"out-a"});
  h.putDraft("editor", first);
  auto started = std::chrono::steady_clock::now();
  auto applied = h.apply({{"session", "editor"}, {"id", "calm"}});
  const auto elapsed = std::chrono::steady_clock::now() - started;
  REQUIRE(applied);
  CHECK(applied->status == 200);
  auto body = nlohmann::json::parse(applied->body);
  CHECK(body["succeeded"] == true);
  CHECK(body["effect"] == "calm");
  CHECK(body["requestedEffect"] == "calm");
  CHECK_FALSE(body.contains("reloadError"));
  CHECK(elapsed < 250ms);
  CHECK(initCount(*h.events) == 1);
  CHECK_FALSE(h.events->has("shutdown out-a replacement"));
  CHECK(*h.host->graphJson() == first);

  // The file, the setting and the running summary agree.
  std::string error;
  auto stored = EffectStore(h.dir.path).read("calm", error);
  REQUIRE(stored);
  CHECK(*stored == first);
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "calm");

  // Re-applying an existing id with new content swaps again and keeps the draft.
  const nlohmann::json second = Graph::builtInVideoGraph({"out-a", "out-b"});
  h.putDraft("editor", second);
  auto again = h.apply({{"session", "editor"}, {"id", "calm"}});
  REQUIRE(again);
  CHECK(again->status == 200);
  CHECK(*h.host->graphJson() == second);
  CHECK(initCount(*h.events) == 1);
  CHECK(h.client->Get("/api/graph/drafts/editor")->status == 200);

  // A restart builds the applied effect from disk.
  h.events->onOutputInit = nullptr;
  auto restarted = Pipeline::build(h.registry, ConfigStore(h.dir.path).load(), h.dir.path, {});
  REQUIRE(restarted);
  CHECK(restarted->summary().effect == "calm");
  CHECK(restarted->graphJson() == second);
  restarted->shutdown(false);
}


TEST_CASE("Apply refuses an invalid draft and leaves disk and the live effect untouched (Aurora-52oz.4)", "[Apply]")
{
  ApplyHarness h("apply-invalid", tunedVideoConfig());
  const nlohmann::json before = *h.host->graphJson();

  nlohmann::json broken = Graph::builtInVideoGraph({"out-a"});
  broken["nodes"].push_back({{"id", "mystery"}, {"type", "nope.nope"}});
  h.putDraft("agent", broken);

  auto refused = h.apply({{"session", "agent"}, {"id", "bad"}});
  REQUIRE(refused);
  CHECK(refused->status == 422);
  auto body = nlohmann::json::parse(refused->body);
  CHECK(body["succeeded"] == false);
  CHECK(body["error"] == "invalid_graph");
  CHECK(body["valid"] == false);
  CHECK(body["errors"][0]["node"] == "mystery");

  CHECK_FALSE(EffectStore(h.dir.path).exists("bad"));
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "");
  CHECK(*h.host->graphJson() == before);
  CHECK(h.host->summary().effect == "builtin.video");
  CHECK(initCount(*h.events) == 1);

  // Other refusals change nothing either.
  CHECK(h.apply({{"session", "nobody"}, {"id", "ok"}})->status == 404);
  h.putDraft("good", Graph::builtInVideoGraph({"out-a"}));
  CHECK(h.apply({{"session", "good"}, {"id", "builtin.video"}})->status == 400);
  CHECK(h.apply({{"session", "good"}, {"id", "../escape"}})->status == 400);
  CHECK(h.apply({{"session", "bad/session"}, {"id", "ok"}})->status == 400);
  CHECK(h.apply({{"session", "good"}})->status == 400);
  CHECK(h.client->Post("/api/graph/apply", "not json", "application/json")->status == 400);
  CHECK(EffectStore(h.dir.path).list().empty());
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "");
}


TEST_CASE("Save writes the effect without making it live, and reloads only the active one (Aurora-pvxx.1)", "[Apply]")
{
  ApplyHarness h("save-inactive", tunedVideoConfig());
  const nlohmann::json before = *h.host->graphJson();
  const nlohmann::json first = Graph::builtInVideoGraph({"out-a"});
  h.putDraft("editor", first);

  auto saved = h.save({{"session", "editor"}, {"id", "calm"}});
  REQUIRE(saved);
  CHECK(saved->status == 200);
  auto body = nlohmann::json::parse(saved->body);
  CHECK(body["succeeded"] == true);
  CHECK(body["id"] == "calm");
  CHECK(body["activeEffectId"] == "");
  CHECK(body["effect"] == "builtin.video");
  CHECK_FALSE(body.contains("reloadError"));

  std::string error;
  auto stored = EffectStore(h.dir.path).read("calm", error);
  REQUIRE(stored);
  CHECK(*stored == first);
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "");
  CHECK(*h.host->graphJson() == before);
  CHECK(h.client->Get("/api/graph/drafts/editor")->status == 200);

  // An MCP-marked save does not record mcpEffectId either.
  const httplib::Headers mcp{{"X-Aurora-Client", "mcp"}};
  REQUIRE(h.client->Post("/api/graph/save", mcp,
    nlohmann::json{{"session", "editor"}, {"id", "calm"}}.dump(), "application/json")->status == 200);
  CHECK(ConfigStore(h.dir.path).load().mcpEffectId().empty());

  // Saving over the active effect reloads it from the new file.
  REQUIRE(h.apply({{"session", "editor"}, {"id", "calm"}})->status == 200);
  const nlohmann::json second = Graph::builtInVideoGraph({"out-a", "out-b"});
  h.putDraft("editor", second);
  auto over = h.save({{"session", "editor"}, {"id", "calm"}});
  REQUIRE(over);
  CHECK(over->status == 200);
  CHECK(nlohmann::json::parse(over->body)["activeEffectId"] == "calm");
  CHECK(*h.host->graphJson() == second);
  CHECK(h.host->summary().effect == "calm");

  // Saving a different id leaves the running effect alone.
  h.putDraft("editor", first);
  REQUIRE(h.save({{"session", "editor"}, {"id", "other"}})->status == 200);
  CHECK(*h.host->graphJson() == second);
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "calm");
}


TEST_CASE("Save refuses what apply refuses and changes nothing (Aurora-pvxx.1)", "[Apply]")
{
  ApplyHarness h("save-refused", tunedVideoConfig());
  const nlohmann::json before = *h.host->graphJson();

  nlohmann::json broken = Graph::builtInVideoGraph({"out-a"});
  broken["nodes"].push_back({{"id", "mystery"}, {"type", "nope.nope"}});
  h.putDraft("agent", broken);
  auto refused = h.save({{"session", "agent"}, {"id", "bad"}});
  REQUIRE(refused);
  CHECK(refused->status == 422);
  auto body = nlohmann::json::parse(refused->body);
  CHECK(body["error"] == "invalid_graph");
  CHECK(body["errors"][0]["node"] == "mystery");
  CHECK_FALSE(EffectStore(h.dir.path).exists("bad"));

  CHECK(h.save({{"session", "nobody"}, {"id", "ok"}})->status == 404);
  h.putDraft("good", Graph::builtInVideoGraph({"out-a"}));
  CHECK(h.save({{"session", "good"}, {"id", "builtin.video"}})->status == 400);
  CHECK(h.save({{"session", "good"}, {"id", "../escape"}})->status == 400);
  CHECK(h.save({{"session", "bad/session"}, {"id", "ok"}})->status == 400);
  CHECK(h.save({{"session", "good"}})->status == 400);
  CHECK(h.client->Post("/api/graph/save", "not json", "application/json")->status == 400);
  CHECK(EffectStore(h.dir.path).list().empty());
  CHECK(*h.host->graphJson() == before);
}


TEST_CASE("Save: draft scope is refused, apply scope passes (Aurora-pvxx.1)", "[Apply][Pairing]")
{
  using namespace Aurora::Network::Http::Server;
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service, [](const std::string& addr){ return addr == "127.0.0.1"; });
  addDraftAccessRules(guard);
  addApplyAccessRules(guard);
  addEffectsAccessRules(guard);

  const std::string draft = service->mintForTest("editor", Scope::Draft);
  const std::string apply = service->mintForTest("adapter", Scope::Apply);
  auto decide = [&](const std::string& path, const std::string& token){
    AccessRequest request;
    request.method = HttpMethod::Post;
    request.path = path;
    request.remoteAddr = "192.168.1.20";
    request.authorization = "Bearer " + token;
    return guard.decide(request).result;
  };
  using Result = AccessDecision::Result;

  for(const char* path : {"/api/graph/save", "/api/effects/builtin.video/duplicate"}){
    CHECK(decide(path, draft) == Result::Forbidden);
    CHECK(decide(path, apply) == Result::Allow);
  }
}


TEST_CASE("Duplicate copies a built-in or custom effect to a new id without replacing or activating (Aurora-pvxx.1)", "[Apply]")
{
  ApplyHarness h("duplicate", tunedVideoConfig());
  EffectStore store(h.dir.path);
  std::string error;

  auto copied = h.duplicate("builtin.video", {{"id", "my-screen"}});
  REQUIRE(copied);
  CHECK(copied->status == 200);
  auto body = nlohmann::json::parse(copied->body);
  CHECK(body["succeeded"] == true);
  CHECK(body["id"] == "my-screen");
  CHECK(body["source"] == "builtin.video");
  nlohmann::json builtIn = nlohmann::json::parse(h.client->Get("/api/effects/builtin.video")->body);
  auto stored = store.read("my-screen", error);
  REQUIRE(stored);
  CHECK(*stored == builtIn["graph"]);
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "");

  // A custom copies byte for byte.
  nlohmann::json mine = Graph::builtInVideoGraph({"out-a", "out-b"});
  mine["title"] = "Mine";
  REQUIRE(store.write("mine", mine, error));
  REQUIRE(h.duplicate("mine", {{"id", "mine-2"}})->status == 200);
  CHECK(*store.read("mine-2", error) == mine);

  // Refusals write nothing.
  CHECK(h.duplicate("mine", {{"id", "mine-2"}})->status == 409);
  CHECK(h.duplicate("mine", {{"id", "builtin.audio"}})->status == 400);
  CHECK(h.duplicate("mine", {{"id", "../x"}})->status == 400);
  CHECK(h.duplicate("mine", nlohmann::json::object())->status == 400);
  CHECK(h.duplicate("nope", {{"id", "fresh"}})->status == 404);
  CHECK(h.duplicate("..", {{"id", "fresh"}})->status == 404);
  CHECK_FALSE(store.exists("fresh"));
  CHECK(store.list() == std::vector<std::string>{"mine", "mine-2", "my-screen"});
}


TEST_CASE("Only an MCP-marked apply records mcpEffectId, and it survives a config reload (Aurora-4xqt.2)", "[Apply]")
{
  ApplyHarness h("apply-mcp", tunedVideoConfig());
  h.putDraft("editor", Graph::builtInVideoGraph({"out-a"}));

  REQUIRE(h.apply({{"session", "editor"}, {"id", "plain"}})->status == 200);
  CHECK(ConfigStore(h.dir.path).load().mcpEffectId().empty());

  const httplib::Headers mcp{{"X-Aurora-Client", "mcp"}};
  auto markedApply = [&](const std::string& id){
    return h.client->Post("/api/graph/apply", mcp,
      nlohmann::json{{"session", "editor"}, {"id", id}}.dump(), "application/json");
  };
  REQUIRE(markedApply("first")->status == 200);
  CHECK(ConfigStore(h.dir.path).load().mcpEffectId() == "first");
  REQUIRE(markedApply("second")->status == 200);
  CHECK(ConfigStore(h.dir.path).load().mcpEffectId() == "second");

  // A refused apply leaves the marker alone.
  CHECK(h.client->Post("/api/graph/apply", mcp, R"({"session": "none", "id": "third"})", "application/json")->status == 404);
  CHECK(ConfigStore(h.dir.path).load().mcpEffectId() == "second");
}


TEST_CASE("Tuning edits on a custom effect write its file and swap in place (Aurora-52oz.7)", "[Apply]")
{
  ApplyHarness h("apply-params", tunedVideoConfig());
  h.putDraft("editor", Graph::builtInVideoGraph({"out-a"}));
  REQUIRE(h.apply({{"session", "editor"}, {"id", "calm"}})->status == 200);
  REQUIRE(initCount(*h.events) == 1);

  std::string easeId;
  const nlohmann::json running = *h.host->graphJson();
  for(const auto& node : running["nodes"]){
    if(node["type"] == "frame.smooth"){ easeId = node["id"]; }
  }
  REQUIRE_FALSE(easeId.empty());
  auto put = [&](const nlohmann::json& body){
    return h.client->Put("/api/effects/calm/params", body.dump(), "application/json");
  };
  auto paramOf = [&](const nlohmann::json& graph){
    for(const auto& node : graph["nodes"]){
      if(node["id"] == easeId){ return node["params"]["smoothing"]; }
    }
    return nlohmann::json();
  };

  auto edited = put({{"params", {{{"node", easeId}, {"param", "smoothing"}, {"value", 0.25}}}}});
  REQUIRE(edited);
  CHECK(edited->status == 200);
  auto body = nlohmann::json::parse(edited->body);
  CHECK(body["succeeded"] == true);
  CHECK(body["effect"] == "calm");
  CHECK_FALSE(body.contains("reloadError"));
  CHECK(paramOf(*h.host->graphJson()) == 0.25);
  CHECK(initCount(*h.events) == 1);
  CHECK_FALSE(h.events->has("shutdown out-a replacement"));

  std::string error;
  auto stored = EffectStore(h.dir.path).read("calm", error);
  REQUIRE(stored);
  CHECK(paramOf(*stored) == 0.25);

  // A restart builds the edited value from disk.
  auto restarted = Pipeline::build(h.registry, ConfigStore(h.dir.path).load(), h.dir.path, {});
  REQUIRE(restarted);
  CHECK(paramOf(restarted->graphJson()) == 0.25);
  restarted->shutdown(false);

  // Refusals change neither the file nor the live graph.
  const nlohmann::json before = *stored;
  CHECK(put({{"params", {{{"node", "nobody"}, {"param", "smoothing"}, {"value", 0.1}}}}})->status == 422);
  CHECK(put({{"params", {{{"node", easeId}, {"param", "smoothing"}, {"value", "fast"}}}}})->status == 422);
  CHECK(put({{"params", nlohmann::json::array()}})->status == 400);
  CHECK(put({{"other", 1}})->status == 400);
  CHECK(h.client->Put("/api/effects/missing/params", R"({"params": []})", "application/json")->status == 400);
  CHECK(h.client->Put("/api/effects/missing/params",
    nlohmann::json{{"params", {{{"node", easeId}, {"param", "smoothing"}, {"value", 0.1}}}}}.dump(),
    "application/json")->status == 404);
  CHECK(h.client->Put("/api/effects/..%2Fx/params", "{}", "application/json")->status != 200);
  stored = EffectStore(h.dir.path).read("calm", error);
  CHECK(*stored == before);
  CHECK(paramOf(*h.host->graphJson()) == 0.25);
}


TEST_CASE("Apply clears a held effect_fallback once the new effect runs (Aurora-52oz.4)", "[Apply]")
{
  ApplyHarness h("apply-fallback", tunedVideoConfig(), "nope");
  REQUIRE(h.host->status().errors.size() == 1);
  CHECK(h.host->summary().effect == "builtin.video");

  h.putDraft("editor", Graph::builtInVideoGraph({"out-a"}));
  auto applied = h.apply({{"session", "editor"}, {"id", "fixed"}});
  REQUIRE(applied);
  CHECK(applied->status == 200);
  CHECK(h.host->status().errors.empty());
  CHECK(h.host->summary().effect == "fixed");
  CHECK(h.host->summary().fallbackReason.empty());
  CHECK(initCount(*h.events) == 1);
}


TEST_CASE("Apply on a host with no pipeline reloads and builds the effect (Aurora-52oz.4)", "[Apply]")
{
  ScopedTempDir dir("apply-idle");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  ConfigStore(dir.path).save(tunedVideoConfig());
  PipelineHost host(nullptr, {});
  std::string error;
  EffectStore store(dir.path);
  REQUIRE(store.write("mine", Graph::builtInVideoGraph({"out-a"}), error));
  ConfigStore(dir.path).update([](Config& config){ config.setActiveEffectId("mine"); return true; });

  CHECK(applyEffectFromDisk(host, registry, dir.path).empty());
  CHECK(host.summary().effect == "mine");
  CHECK(initCount(*events) == 1);
  host.shutdown();
}


#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
TEST_CASE("Apply reloads when the graph needs different inputs (Aurora-52oz.4)", "[Apply][Audio]")
{
  Config config = tunedVideoConfig();
  config.setActiveAudioInputName("fake-audio");
  ApplyHarness h("apply-inputs", config);
  REQUIRE(initCount(*h.events) == 1);

  // Video to audio-only changes the open inputs, so the pipeline rebuilds.
  h.putDraft("editor", Graph::builtInAudioGraph({"out-a", "out-b"}));
  auto applied = h.apply({{"session", "editor"}, {"id", "sound"}});
  REQUIRE(applied);
  CHECK(applied->status == 200);
  CHECK(nlohmann::json::parse(applied->body)["effect"] == "sound");
  CHECK(initCount(*h.events) == 2);
  CHECK(h.events->has("shutdown out-a replacement"));
  CHECK(h.host->capabilities().usesAudioInput);
  CHECK_FALSE(h.host->capabilities().usesVideoInput);

  // Another audio-only graph keeps the inputs, so it swaps in place.
  h.putDraft("editor", Graph::builtInAudioGraph({"out-a"}));
  auto swapped = h.apply({{"session", "editor"}, {"id", "sound"}});
  REQUIRE(swapped);
  CHECK(swapped->status == 200);
  CHECK(initCount(*h.events) == 2);
  CHECK(*h.host->graphJson() == Graph::builtInAudioGraph({"out-a"}));
}
#endif


TEST_CASE("Apply: draft scope is refused, apply scope passes (Aurora-52oz.4)", "[Apply][Pairing]")
{
  using namespace Aurora::Network::Http::Server;
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service, [](const std::string& addr){ return addr == "127.0.0.1"; });
  addDraftAccessRules(guard);
  addApplyAccessRules(guard);

  const std::string read = service->mintForTest("viewer", Scope::Read);
  const std::string draft = service->mintForTest("editor", Scope::Draft);
  const std::string apply = service->mintForTest("adapter", Scope::Apply);

  auto decide = [&](const std::string& token, const std::string& addr = "192.168.1.20"){
    AccessRequest request;
    request.method = HttpMethod::Post;
    request.path = "/api/graph/apply";
    request.remoteAddr = addr;
    if(!token.empty()){ request.authorization = "Bearer " + token; }
    return guard.decide(request).result;
  };
  using Result = AccessDecision::Result;

  CHECK(decide(read) == Result::Forbidden);
  CHECK(decide(draft) == Result::Forbidden);
  CHECK(decide(apply) == Result::Allow);
  CHECK(decide("") == Result::Unauthorized);
  CHECK(decide("", "127.0.0.1") == Result::Allow);
}


namespace
{
  // The apply harness plus test-on-lights routes on a fake clock.
  struct LightTestHarness
  {
    explicit LightTestHarness(const std::string& name, Config config = tunedVideoConfig()):
    dir(name),
    events(std::make_shared<Events>()),
    registry(makeRegistry(events))
    {
      ConfigStore(dir.path).save(config);
      host = std::make_unique<PipelineHost>(Pipeline::build(registry, config, dir.path, {}), PipelineOptions{});
      auto drafts = registerDraftRoutes(server, registry, dir.path);
      auto applyDraft = registerApplyRoutes(server, *host, registry, dir.path, drafts,
        [this]{ return applyEffectFromDisk(*host, registry, dir.path); });
      test = registerTestRoutes(server, *host, registry, dir.path, drafts, applyDraft, nullptr, {},
        [this]{ return nowMs.load(); }, false);
      // Wired as the app mains wire them (Aurora-zfre).
      auto onEffectChosen = [this]{ std::string error; test->stop(error, "superseded"); };
      registerStateRoute(server, *host, registry, dir.path, test);
      auto reload = std::make_shared<ReloadCoalescer>([this]{ return applyConfigFromDisk(*host, registry, dir.path); });
      registerSettingsRoutes(server, dir.path, reload, onEffectChosen);
      registerEffectsRoutes(server, *host, registry, dir.path, reload, onEffectChosen);
      registerPublicApiRoutes(server, *host, registry, dir.path, reload, test, nullptr, {"test", "dev", false, false, nullptr});
      const int port = server.bindToAnyPort("127.0.0.1");
      REQUIRE(port > 0);
      serverThread = std::thread([this](){ server.listen(); });
      client = std::make_unique<httplib::Client>("127.0.0.1", port);
      live = *host->graphJson();
    }

    ~LightTestHarness()
    {
      server.stop();
      serverThread.join();
      host->shutdown();
    }

    void putDraft(const std::string& session, const nlohmann::json& graph)
    {
      auto result = client->Put("/api/graph/drafts/" + session, nlohmann::json{{"graph", graph}}.dump(), "application/json");
      REQUIRE(result);
    }

    int post(const std::string& path, const nlohmann::json& body)
    {
      auto result = client->Post(path, body.dump(), "application/json");
      REQUIRE(result);
      return result->status;
    }

    int start(const std::string& session) { return post("/api/graph/test", {{"session", session}}); }
    int beat(const std::string& session) { return post("/api/graph/test/heartbeat", {{"session", session}}); }

    // Advances the fake clock and lets the server enforce deadlines.
    void advance(std::int64_t ms)
    {
      nowMs += ms;
      test->poll();
    }

    ScopedTempDir dir;
    std::shared_ptr<Events> events;
    Registry registry;
    std::unique_ptr<PipelineHost> host;
    Aurora::Network::Http::Server::HttpServer server;
    std::shared_ptr<LightTest> test;
    std::atomic<std::int64_t> nowMs{1000};
    std::thread serverThread;
    std::unique_ptr<httplib::Client> client;
    nlohmann::json live;
  };
}


TEST_CASE("Test on lights runs the draft in place and an explicit revert puts the live effect back (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-revert");
  const nlohmann::json draft = Graph::builtInVideoGraph({"out-a"});
  REQUIRE(draft != h.live);
  h.putDraft("editor", draft);

  CHECK(h.start("editor") == 200);
  CHECK(*h.host->graphJson() == draft);
  CHECK(initCount(*h.events) == 1);
  CHECK(h.test->info().active);
  // The test graph's declared inputs show in the summary, and go with the revert (Aurora-tc8w).
  REQUIRE(h.host->summary().graphInputs);
  CHECK(h.host->summary().graphInputs->video);
  // Nothing is written: the test lives only in the running pipeline.
  CHECK(EffectStore(h.dir.path).list().empty());
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "");

  CHECK(h.post("/api/graph/test/revert", {{"session", "editor"}}) == 200);
  CHECK(*h.host->graphJson() == h.live);
  CHECK_FALSE(h.test->info().active);
  CHECK(h.test->info().lastEnd == "reverted");
  REQUIRE(h.host->summary().graphInputs);
  CHECK(h.host->summary().graphInputs->video);
  CHECK_FALSE(h.host->summary().graphInputs->audio);
  CHECK(initCount(*h.events) == 1);
  CHECK(h.beat("editor") == 404);
  CHECK(h.post("/api/graph/test/revert", {{"session", "editor"}}) == 404);
}


TEST_CASE("Test on lights reverts at the confirm window and after missed heartbeats (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-timeouts");
  const nlohmann::json draft = Graph::builtInVideoGraph({"out-a"});
  h.putDraft("editor", draft);

  // Heartbeats keep the test alive past 15 s but the cap still ends it.
  REQUIRE(h.start("editor") == 200);
  for(int i = 0; i < 59; ++i){
    h.advance(2000);
    CHECK(h.beat("editor") == 200);
  }
  CHECK(*h.host->graphJson() == draft);
  h.advance(2000);
  CHECK(h.test->info().lastEnd == "confirm_timeout");
  CHECK(*h.host->graphJson() == h.live);
  CHECK(h.beat("editor") == 404);

  // A client that stops heartbeating loses the lights after the lapse.
  REQUIRE(h.start("editor") == 200);
  h.advance(2000);
  CHECK(h.beat("editor") == 200);
  h.advance(5900);
  CHECK(*h.host->graphJson() == draft);
  h.advance(200);
  CHECK(h.test->info().lastEnd == "heartbeat_lost");
  CHECK(*h.host->graphJson() == h.live);
  CHECK(initCount(*h.events) == 1);
}


TEST_CASE("A second test replaces the first and only the second's session can end it (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-replace");
  const nlohmann::json first = Graph::builtInVideoGraph({"out-a"});
  const nlohmann::json second = Graph::builtInVideoGraph({"out-a", "out-b"});
  h.putDraft("one", first);
  h.putDraft("two", second);

  REQUIRE(h.start("one") == 200);
  REQUIRE(h.start("two") == 200);
  CHECK(*h.host->graphJson() == second);
  CHECK(h.beat("one") == 404);
  CHECK(h.beat("two") == 200);
  CHECK(h.post("/api/graph/test/revert", {{"session", "one"}}) == 404);
  CHECK(*h.host->graphJson() == second);

  CHECK(h.post("/api/graph/test/revert", {{"session", "two"}}) == 200);
  CHECK(*h.host->graphJson() == h.live);
}


TEST_CASE("Pausing during a test ends it and resume builds the live effect (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-pause");
  h.putDraft("editor", Graph::builtInVideoGraph({"out-a"}));
  REQUIRE(h.start("editor") == 200);

  REQUIRE(h.host->pause());
  CHECK_FALSE(h.test->info().active);
  CHECK(h.test->info().lastEnd == "pipeline_gone");
  CHECK(h.beat("editor") == 404);
  // No pipeline to test on while paused.
  CHECK(h.start("editor") == 409);

  std::string error;
  REQUIRE(h.host->resume(h.registry, ConfigStore(h.dir.path).load(), h.dir.path, error));
  CHECK(*h.host->graphJson() == h.live);
  CHECK_FALSE(h.test->info().active);
}


TEST_CASE("Confirm after a test persists like apply and ends the test without reverting (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-confirm");
  const nlohmann::json draft = Graph::builtInVideoGraph({"out-a"});
  h.putDraft("editor", draft);
  REQUIRE(h.start("editor") == 200);

  CHECK(h.post("/api/graph/test/confirm", {{"session", "other"}, {"id", "kept"}}) == 404);
  CHECK(h.post("/api/graph/test/confirm", {{"session", "editor"}}) == 400);

  // An edited draft is no longer the graph under test.
  h.putDraft("editor", Graph::builtInVideoGraph({"out-b"}));
  CHECK(h.post("/api/graph/test/confirm", {{"session", "editor"}, {"id", "kept"}}) == 409);
  CHECK_FALSE(EffectStore(h.dir.path).exists("kept"));
  h.putDraft("editor", draft);

  CHECK(h.post("/api/graph/test/confirm", {{"session", "editor"}, {"id", "kept"}}) == 200);
  CHECK(h.test->info().lastEnd == "confirmed");
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "kept");
  CHECK(EffectStore(h.dir.path).exists("kept"));
  CHECK(h.host->summary().effect == "kept");
  CHECK(initCount(*h.events) == 1);

  // The deadline passing later reverts nothing.
  h.advance(60000);
  CHECK(*h.host->graphJson() == draft);
  CHECK(h.host->summary().effect == "kept");
}


TEST_CASE("A revert restores a live custom effect from disk, not the pre-test graph (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-custom-live");
  const nlohmann::json mine = Graph::builtInVideoGraph({"out-a"});
  h.putDraft("editor", mine);
  REQUIRE(h.post("/api/graph/apply", {{"session", "editor"}, {"id", "mine"}}) == 200);

  h.putDraft("editor", Graph::builtInVideoGraph({"out-a", "out-b"}));
  REQUIRE(h.start("editor") == 200);
  CHECK(h.host->summary().effect == "mine");
  CHECK(*h.host->graphJson() != mine);

  h.advance(20000);
  CHECK(*h.host->graphJson() == mine);
  CHECK(h.host->summary().effect == "mine");
  CHECK(initCount(*h.events) == 1);
}


TEST_CASE("Test on lights refuses what apply refuses and changes nothing (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-refuse");
  nlohmann::json broken = Graph::builtInVideoGraph({"out-a"});
  broken["nodes"].push_back({{"id", "mystery"}, {"type", "nope.nope"}});
  h.putDraft("agent", broken);

  auto refused = h.client->Post("/api/graph/test", nlohmann::json{{"session", "agent"}}.dump(), "application/json");
  REQUIRE(refused);
  CHECK(refused->status == 422);
  CHECK(nlohmann::json::parse(refused->body)["errors"][0]["node"] == "mystery");
  CHECK(h.start("nobody") == 404);
  CHECK(h.start("bad/session") == 400);
  CHECK(h.post("/api/graph/test", {{"nope", 1}}) == 400);
  CHECK_FALSE(h.test->info().active);
  CHECK(*h.host->graphJson() == h.live);

  // A refused start leaves a running test alone.
  h.putDraft("good", Graph::builtInVideoGraph({"out-a"}));
  REQUIRE(h.start("good") == 200);
  CHECK(h.start("agent") == 422);
  CHECK(h.beat("good") == 200);
}


TEST_CASE("GET /api/graph/test reports the running test (Aurora-52oz.5)", "[LightTest]")
{
  LightTestHarness h("lt-status");
  auto idle = nlohmann::json::parse(h.client->Get("/api/graph/test")->body);
  CHECK(idle["active"] == false);
  CHECK(idle["lastEnd"].is_null());

  h.putDraft("editor", Graph::builtInVideoGraph({"out-a"}));
  auto started = h.client->Post("/api/graph/test", nlohmann::json{{"session", "editor"}}.dump(), "application/json");
  auto startBody = nlohmann::json::parse(started->body);
  CHECK(startBody["confirmWithinMs"] == 120000);
  CHECK(startBody["heartbeatMs"] == 2000);
  CHECK(startBody["revertAfterMs"] == 6000);

  h.advance(3000);
  auto running = nlohmann::json::parse(h.client->Get("/api/graph/test")->body);
  CHECK(running["active"] == true);
  CHECK(running["confirmRemainingMs"] == 117000);
  CHECK(running["revertAfterMs"] == 3000);
}


TEST_CASE("GET /api/state reports the test and /stop ends another session's test (Aurora-zfre)", "[LightTest]")
{
  LightTestHarness h("lt-stop");
  auto state = [&]{ return nlohmann::json::parse(h.client->Get("/api/state")->body); };
  CHECK(state()["test"] == nlohmann::json{{"active", false}, {"confirmRemainingMs", 0}, {"holder", nullptr}});
  CHECK(h.post("/api/graph/test/stop", nlohmann::json::object()) == 404);

  h.putDraft("mcp-1", Graph::builtInVideoGraph({"out-a"}));
  REQUIRE(h.start("mcp-1") == 200);
  h.advance(3000);
  const nlohmann::json running = state();
  CHECK(running["test"] == nlohmann::json{
    {"active", true},
    {"confirmRemainingMs", 117000},
    {"holder", {{"session", "mcp-1"}, {"client", nullptr}}}
  });
  CHECK(running["effect"] == "builtin.video");

  // The WebUI has no session of its own and needs none.
  auto stopped = h.client->Post("/api/graph/test/stop", "", "application/json");
  REQUIRE(stopped);
  CHECK(stopped->status == 200);
  CHECK(nlohmann::json::parse(stopped->body) == nlohmann::json{{"succeeded", true}});
  CHECK(*h.host->graphJson() == h.live);
  CHECK(h.test->info().lastEnd == "stopped");
  CHECK(h.beat("mcp-1") == 404);
  CHECK(state()["test"]["active"] == false);
  CHECK(initCount(*h.events) == 1);
}


TEST_CASE("A second session's test names its holder and reports the takeover (Aurora-0tqq)", "[LightTest]")
{
  LightTestHarness h("lt-replace");
  h.putDraft("editor", Graph::builtInVideoGraph({"out-a"}));
  h.putDraft("agent", Graph::builtInVideoGraph({"out-a"}));
  auto get = [&](const std::string& path){ return nlohmann::json::parse(h.client->Get(path)->body); };
  CHECK(get("/api/graph/test")["holder"].is_null());

  REQUIRE(h.start("editor") == 200);
  CHECK(get("/api/graph/test")["holder"] == nlohmann::json{{"session", "editor"}, {"client", nullptr}});

  // The agent identifies itself by X-Aurora-Client and takes the lights.
  auto taken = h.client->Post(
    "/api/graph/test",
    {{"X-Aurora-Client", "mcp"}},
    nlohmann::json{{"session", "agent"}}.dump(),
    "application/json"
  );
  REQUIRE(taken);
  CHECK(taken->status == 200);
  CHECK(h.test->info().lastEnd == "replaced");
  const nlohmann::json expected{{"session", "agent"}, {"client", "mcp"}};
  CHECK(get("/api/graph/test")["holder"] == expected);
  CHECK(get("/api/graph/test")["lastEnd"] == "replaced");
  CHECK(get("/api/state")["test"]["holder"] == expected);

  // The editor learns why, and from whom, on its next heartbeat.
  auto lost = h.client->Post(
    "/api/graph/test/heartbeat", nlohmann::json{{"session", "editor"}}.dump(), "application/json");
  REQUIRE(lost);
  CHECK(lost->status == 404);
  const nlohmann::json body = nlohmann::json::parse(lost->body);
  CHECK(body["error"] == "no_test");
  CHECK(body["lastEnd"] == "replaced");
  CHECK(body["holder"] == expected);
  CHECK(h.beat("agent") == 200);

  // The same session testing again is a restart, not a takeover.
  std::string revertError;
  CHECK(h.test->stop(revertError));
  REQUIRE(h.start("agent") == 200);
  REQUIRE(h.start("agent") == 200);
  CHECK(h.test->info().lastEnd == "stopped");
}


TEST_CASE("An effect choice the pipeline applies in place ends a running test (Aurora-zfre)", "[LightTest]")
{
  LightTestHarness h("lt-toggle");
  const nlohmann::json draft = Graph::builtInVideoGraph({"out-a"});
  h.putDraft("mcp-1", draft);
  auto put = [&](const std::string& path, const nlohmann::json& body){
    auto result = h.client->Put(path, body.dump(), "application/json");
    REQUIRE(result);
    return result->status;
  };

  // The Video toggle while video runs changes no reload field, so it applies
  // in place; the test must not outlive the click and revert over it later.
  REQUIRE(h.start("mcp-1") == 200);
  CHECK(put("/api/config", {{"activeEffectId", "builtin.video"}}) == 200);
  CHECK_FALSE(h.test->info().active);
  CHECK(h.test->info().lastEnd == "superseded");
  CHECK(*h.host->graphJson() == h.live);
  CHECK(h.beat("mcp-1") == 404);

  // The effects switch to the running built-in is the same case.
  REQUIRE(h.start("mcp-1") == 200);
  CHECK(put("/api/effects", {{"activeEffectId", ""}}) == 200);
  CHECK(h.test->info().lastEnd == "superseded");
  CHECK(*h.host->graphJson() == h.live);

  // A tuning save is not a choice: the test keeps the lights.
  REQUIRE(h.start("mcp-1") == 200);
  CHECK(put("/api/config", {{"brightness", 0.5}}) == 200);
  CHECK(h.test->info().active);
  CHECK(*h.host->graphJson() == draft);
  CHECK(initCount(*h.events) == 1);
}


TEST_CASE("Test on lights: draft scope is refused, apply scope passes (Aurora-52oz.5)", "[LightTest][Pairing]")
{
  using namespace Aurora::Network::Http::Server;
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service, [](const std::string& addr){ return addr == "127.0.0.1"; });
  addDraftAccessRules(guard);
  addTestAccessRules(guard);

  const std::string read = service->mintForTest("viewer", Scope::Read);
  const std::string draft = service->mintForTest("editor", Scope::Draft);
  const std::string apply = service->mintForTest("adapter", Scope::Apply);

  auto decide = [&](HttpMethod method, const std::string& path, const std::string& token,
                    const std::string& addr = "192.168.1.20"){
    AccessRequest request;
    request.method = method;
    request.path = path;
    request.remoteAddr = addr;
    if(!token.empty()){ request.authorization = "Bearer " + token; }
    return guard.decide(request).result;
  };
  using Result = AccessDecision::Result;

  CHECK(decide(HttpMethod::Get, "/api/graph/test", read) == Result::Allow);
  for(const char* path : {"/api/graph/test", "/api/graph/test/heartbeat", "/api/graph/test/revert", "/api/graph/test/confirm"}){
    CHECK(decide(HttpMethod::Post, path, read) == Result::Forbidden);
    CHECK(decide(HttpMethod::Post, path, draft) == Result::Forbidden);
    CHECK(decide(HttpMethod::Post, path, apply) == Result::Allow);
    CHECK(decide(HttpMethod::Post, path, "") == Result::Unauthorized);
    CHECK(decide(HttpMethod::Post, path, "", "127.0.0.1") == Result::Allow);
  }

  // Stop ends anyone's test, so it is the WebUI's (Aurora-zfre).
  const std::string admin = service->mintForTest("desktop", Scope::Admin);
  CHECK(decide(HttpMethod::Post, "/api/graph/test/stop", apply) == Result::Forbidden);
  CHECK(decide(HttpMethod::Post, "/api/graph/test/stop", admin) == Result::Allow);
  CHECK(decide(HttpMethod::Post, "/api/graph/test/stop", "", "127.0.0.1") == Result::Allow);
}


TEST_CASE("The watchdog thread reverts a test whose client went silent (Aurora-52oz.5)", "[LightTest]")
{
  std::atomic<int> reverts{0};
  LightTestHooks hooks;
  hooks.start = [](const nlohmann::json&){ return std::string{}; };
  hooks.revert = [&reverts]{ ++reverts; return std::string{}; };
  hooks.generation = []{ return std::uint64_t{1}; };
  LightTestOptions options;
  options.lapseMs = 100;
  LightTest test(hooks, options);
  test.startWatchdog(10);

  REQUIRE(test.start("editor", nlohmann::json::object()).empty());
  for(int i = 0; i < 200 && reverts == 0; ++i){
    std::this_thread::sleep_for(10ms);
  }
  CHECK(reverts == 1);
  CHECK_FALSE(test.heartbeat("editor"));
}


namespace
{
  // The video graph with every frame.gain set to `gain`: all-red input shows as
  // red scaled by it, so the draft is told apart from the live graph.
  nlohmann::json gainGraph(float gain)
  {
    nlohmann::json doc = Graph::builtInVideoGraph({"out-a"});
    for(auto& node : doc["nodes"]){
      if(node["type"] == "frame.gain"){
        node["params"]["gain"] = gain;
      }
    }
    return doc;
  }

  // Draft routes plus the preview stream on a real server.
  struct PreviewHarness
  {
    // `prepare` runs once the config dir exists, before the pipeline builds.
    explicit PreviewHarness(
      const std::string& name,
      std::chrono::milliseconds interval = 20ms,
      Config config = tunedVideoConfig(),
      const std::function<void(const std::filesystem::path&)>& prepare = {}):
    dir(name),
    events(std::make_shared<Events>()),
    registry(makeRegistry(events))
    {
      if(prepare){ prepare(dir.path); }
      ConfigStore(dir.path).save(config);
      host = std::make_unique<PipelineHost>(Pipeline::build(registry, config, dir.path, {}), PipelineOptions{});
      drafts = registerDraftRoutes(server, registry, dir.path);
      PreviewOptions options;
      options.interval = interval;
      // The summary route steps by ticking the pipeline, so time is virtual.
      options.sleep = [this](std::chrono::milliseconds){ host->tick(); };
      options.maxSummarySeconds = 5.0;
      registerPreviewRoutes(server, *host, registry, drafts, options);
      port = server.bindToAnyPort("127.0.0.1");
      REQUIRE(port > 0);
      serverThread = std::thread([this](){ server.listen(); });
      client = std::make_unique<httplib::Client>("127.0.0.1", port);
    }

    ~PreviewHarness()
    {
      server.stop();
      serverThread.join();
      host->shutdown();
    }

    void putDraft(const std::string& session, const nlohmann::json& graph)
    {
      auto result = client->Put("/api/graph/drafts/" + session, nlohmann::json{{"graph", graph}}.dump(), "application/json");
      REQUIRE(result);
    }

    // Ticks until the stream's latest preview event satisfies `done`.
    template<typename Pred>
    bool tickUntil(SseReader& reader, Pred done)
    {
      for(int attempt = 0; attempt < 200; ++attempt){
        host->tick();
        std::this_thread::sleep_for(10ms);
        const auto shown = eventsOf(reader.data(), "preview");
        if(!shown.empty() && done(shown.back())){
          return true;
        }
      }
      return false;
    }

    ScopedTempDir dir;
    std::shared_ptr<Events> events;
    Registry registry;
    std::unique_ptr<PipelineHost> host;
    Aurora::Network::Http::Server::HttpServer server;
    std::shared_ptr<DraftStore> drafts;
    int port{0};
    std::thread serverThread;
    std::unique_ptr<httplib::Client> client;
  };

  float firstRed(const nlohmann::json& preview)
  {
    return preview.at("outputs").at(0).at("zones").at(0).at("r").get<float>();
  }
}


TEST_CASE("GET /api/graph/preview streams the draft's zone colors and never sends to an output (Aurora-52oz.6)", "[Preview]")
{
  PreviewHarness h("preview-colors");
  h.putDraft("editor", gainGraph(0.f));

  SseReader reader(h.port, "/api/graph/preview?session=editor");
  REQUIRE(reader.status() == 200);
  REQUIRE(reader.waitFor("event: preview\n"));

  const int sendsBefore = h.events->sendCount;
  REQUIRE(h.tickUntil(reader, [](const nlohmann::json& p){ return !p["outputs"].empty(); }));
  CHECK(h.events->sendCount - sendsBefore > 0);
  const auto first = eventsOf(reader.data(), "preview").back();
  CHECK(first["session"] == "editor");
  CHECK(first["outputs"][0]["output"] == "out-a");
  CHECK(first["outputs"][0]["zones"].size() == 2);
  CHECK(firstRed(first) == 0.f);
  CHECK_FALSE(first["outputs"][0]["zones"][0]["error"].get<bool>());

  // An edit to the draft shows up in the same stream, with no reconnect.
  h.putDraft("editor", gainGraph(1.f));
  CHECK(h.tickUntil(reader, [](const nlohmann::json& p){ return firstRed(p) > 0.f; }));

  // The live path alone reaches the outputs: one send per output per tick.
  const int ticksBefore = h.events->sendCount;
  for(int i = 0; i < 10; ++i){ h.host->tick(); }
  CHECK(h.events->sendCount - ticksBefore == 10 * 2);
}


TEST_CASE("The preview stream is throttled to its interval and costs the live tick little (Aurora-52oz.6)", "[Preview]")
{
  PreviewHarness h("preview-throttle", 100ms);
  h.putDraft("editor", gainGraph(1.f));

  using Clock = std::chrono::steady_clock;
  auto timeTicks = [&](int count){
    const auto start = Clock::now();
    for(int i = 0; i < count; ++i){ h.host->tick(); }
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count() / count;
  };
  const double bare = timeTicks(200);

  SseReader reader(h.port, "/api/graph/preview?session=editor");
  REQUIRE(reader.waitFor("event: preview\n"));

  const auto start = Clock::now();
  const double withPreview = timeTicks(200);
  // Paced ticks keep the colors moving while the stream samples them.
  for(int i = 0; i < 40; ++i){
    h.host->tick();
    std::this_thread::sleep_for(5ms);
  }
  const double elapsedMs = std::chrono::duration<double, std::milli>(Clock::now() - start).count();

  const auto shown = eventsOf(reader.data(), "preview");
  INFO("live tick " << bare << " ms bare, " << withPreview << " ms with a preview; "
    << shown.size() << " preview events in " << elapsedMs << " ms; preview tick "
    << (shown.empty() ? 0.0 : shown.back()["tickMs"].get<double>()) << " ms");
  CHECK(static_cast<double>(shown.size()) <= elapsedMs / 100.0 + 3.0);
  // The tick budget at 30 Hz is 33 ms; the preview must stay far inside it.
  CHECK(withPreview < 33.0 / 4.0);
}


TEST_CASE("The preview stream flags bad sessions and missing drafts, then ends (Aurora-52oz.6)", "[Preview]")
{
  PreviewHarness h("preview-refusals");

  SseReader badSession(h.port, "/api/graph/preview?session=has%20space");
  REQUIRE(badSession.waitFor("\"error\":\"invalid_session\""));
  CHECK(badSession.waitFinished());

  SseReader noDraft(h.port, "/api/graph/preview?session=editor");
  REQUIRE(noDraft.waitFor("\"error\":\"no_draft\""));
  CHECK(noDraft.waitFinished());

  // Needs an input that is not configured at all: refused, nothing reloaded.
  nlohmann::json both = Graph::builtInVideoGraph({"out-a"});
  both["nodes"].push_back({{"id", "mic"}, {"type", "audio.capture"}, {"params", nlohmann::json::object()}});
  h.putDraft("other", both);
  SseReader cannot(h.port, "/api/graph/preview?session=other");
  REQUIRE(cannot.waitFor("event: error\n"));
  CHECK(cannot.waitFinished());
}


TEST_CASE("The preview stream closes when its draft is deleted or the pipeline pauses (Aurora-52oz.6)", "[Preview]")
{
  PreviewHarness h("preview-closing");
  h.putDraft("editor", gainGraph(1.f));
  h.putDraft("second", gainGraph(1.f));

  SseReader deleted(h.port, "/api/graph/preview?session=editor");
  SseReader paused(h.port, "/api/graph/preview?session=second");
  REQUIRE(deleted.waitFor("event: preview\n"));
  REQUIRE(paused.waitFor("event: preview\n"));

  auto removed = h.client->Delete("/api/graph/drafts/editor");
  REQUIRE(removed);
  CHECK(deleted.waitFor("\"reason\":\"draft_deleted\""));
  CHECK(deleted.waitFinished());

  REQUIRE(h.host->pause());
  CHECK(paused.waitFor("\"reason\":\"pipeline_gone\""));
  CHECK(paused.waitFinished());
}


TEST_CASE("A second stream for a session replaces the first (Aurora-52oz.6)", "[Preview]")
{
  PreviewHarness h("preview-replaced");
  h.putDraft("editor", gainGraph(1.f));

  SseReader first(h.port, "/api/graph/preview?session=editor");
  REQUIRE(first.waitFor("event: preview\n"));
  SseReader second(h.port, "/api/graph/preview?session=editor");
  REQUIRE(second.waitFor("event: preview\n"));

  CHECK(first.waitFor("\"reason\":\"replaced\""));
  CHECK(first.waitFinished());
  CHECK(h.tickUntil(second, [](const nlohmann::json& p){ return !p["outputs"].empty(); }));
}


namespace
{
  // gainGraph(1) with an lfo scaling the frame before the floor.
  nlohmann::json lfoGraph(float rateHz)
  {
    nlohmann::json doc = gainGraph(1.f);
    doc["nodes"].push_back({{"id", "wave"}, {"type", "lfo"}, {"params", {{"shape", "sine"}, {"rateHz", rateHz}, {"min", 0.f}, {"max", 1.f}}}});
    doc["nodes"].push_back({{"id", "mod"}, {"type", "frame.brightnessScale"}, {"params", nlohmann::json::object()}});
    for(auto& edge : doc["edges"]){
      if(edge[0] == "gain_out_a.frame"){ edge[0] = "mod.frame"; }
    }
    doc["edges"].push_back(nlohmann::json::array({"gain_out_a.frame", "mod.frame"}));
    doc["edges"].push_back(nlohmann::json::array({"wave.value", "mod.factor"}));
    return doc;
  }
}


TEST_CASE("GET /api/graph/preview/summary reports a frozen graph as still and an lfo graph as moving (Aurora-4xqt.5)", "[Preview]")
{
  PreviewHarness h("preview-summary");
  h.putDraft("still", gainGraph(1.f));
  h.putDraft("moving", lfoGraph(5.f));
  const int sendsBefore = h.events->sendCount;

  auto still = h.client->Get("/api/graph/preview/summary?session=still&seconds=2");
  REQUIRE(still);
  REQUIRE(still->status == 200);
  const auto frozen = nlohmann::json::parse(still->body);
  CHECK(frozen["session"] == "still");
  CHECK(frozen["samples"].get<int>() > 2);
  REQUIRE(frozen["outputs"].size() == 1);
  CHECK(frozen["outputs"][0]["output"] == "out-a");
  CHECK(frozen["outputs"][0]["change"].get<double>() < 0.01);
  const auto& zone = frozen["outputs"][0]["zones"][0];
  CHECK(zone["mean"]["r"].get<double>() > 0.5);
  CHECK(zone["brightnessMax"].get<double>() - zone["brightnessMin"].get<double>() < 0.01);

  auto moving = h.client->Get("/api/graph/preview/summary?session=moving&seconds=2");
  REQUIRE(moving);
  REQUIRE(moving->status == 200);
  const auto reacting = nlohmann::json::parse(moving->body);
  CHECK(reacting["outputs"][0]["change"].get<double>() > 0.02);
  CHECK(reacting["outputs"][0]["change"].get<double>() <= 1.0);
  const auto& wave = reacting["outputs"][0]["zones"][0];
  CHECK(wave["brightnessMax"].get<double>() - wave["brightnessMin"].get<double>() > 0.2);

  // The summary's ticks ran the live path, and nothing it drew reached an output.
  const int ticks = h.events->sendCount - sendsBefore;
  CHECK(ticks == (frozen["samples"].get<int>() + reacting["samples"].get<int>()) * 2);
}


TEST_CASE("The preview summary bounds its duration and refuses bad requests (Aurora-4xqt.5)", "[Preview]")
{
  PreviewHarness h("preview-summary-refusals", 100ms);
  h.putDraft("editor", gainGraph(1.f));

  auto capped = h.client->Get("/api/graph/preview/summary?session=editor&seconds=9999");
  REQUIRE(capped);
  REQUIRE(capped->status == 200);
  const auto body = nlohmann::json::parse(capped->body);
  CHECK(body["seconds"].get<double>() == 5.0);
  CHECK(body["samples"].get<int>() == 50);

  for(const char* seconds : {"abc", "-1", "0", "nan", "2x"}){
    auto bad = h.client->Get(std::string("/api/graph/preview/summary?session=editor&seconds=") + seconds);
    REQUIRE(bad);
    CHECK(bad->status == 400);
    CHECK(nlohmann::json::parse(bad->body)["error"] == "invalid_seconds");
  }
  auto badSession = h.client->Get("/api/graph/preview/summary?session=has%20space");
  REQUIRE(badSession);
  CHECK(badSession->status == 400);
  auto missing = h.client->Get("/api/graph/preview/summary?session=nobody");
  REQUIRE(missing);
  CHECK(missing->status == 404);
}


TEST_CASE("The preview summary leaves an open stream for the session alone (Aurora-4xqt.5)", "[Preview]")
{
  PreviewHarness h("preview-summary-stream");
  h.putDraft("editor", gainGraph(1.f));

  SseReader reader(h.port, "/api/graph/preview?session=editor");
  REQUIRE(reader.waitFor("event: preview\n"));
  auto summary = h.client->Get("/api/graph/preview/summary?session=editor&seconds=1");
  REQUIRE(summary);
  CHECK(summary->status == 200);
  CHECK(reader.data().find("\"reason\":\"replaced\"") == std::string::npos);
  CHECK(h.tickUntil(reader, [](const nlohmann::json& p){ return !p["outputs"].empty(); }));
}


TEST_CASE("PipelineHost::reloadInputs keeps outputs when the list is unchanged and replaces them otherwise (Aurora-4xqt.1)", "[PipelineHost]")
{
  ScopedTempDir dir("reload-inputs-outputs");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  Config config = tunedVideoConfig();
  config.setActiveOutputNames({"out-a", "out-b"});
  PipelineHost host(Pipeline::build(registry, config, dir.path, {}), {});
  const std::uint64_t epoch = host.buildEpoch();
  REQUIRE(initCount(*events) == 1);

  std::string error;
  REQUIRE(host.reloadInputs(registry, config, dir.path, nullptr, error));
  CHECK(host.buildEpoch() > epoch);
  CHECK(initCount(*events) == 1);
  CHECK(initCount(*events, "out-b") == 1);
  CHECK_FALSE(events->has("shutdown out-a replacement"));
  host.tick();
  CHECK(events->sendCount == 2);

  // A different output list cannot reuse them: the old ones shut down.
  Config fewer = config;
  fewer.setActiveOutputNames({"out-a"});
  REQUIRE(host.reloadInputs(registry, fewer, dir.path, nullptr, error));
  CHECK(initCount(*events) == 2);
  CHECK(events->has("shutdown out-a replacement"));
  CHECK(events->has("shutdown out-b replacement"));
  host.shutdown();
}


TEST_CASE("PipelineHost::reloadInputs refuses without a pipeline and leaves a running one alone on a failed build (Aurora-4xqt.1)", "[PipelineHost]")
{
  ScopedTempDir dir("reload-inputs-refuse");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  PipelineHost host(Pipeline::build(registry, tunedVideoConfig(), dir.path, {}), {});
  const nlohmann::json before = *host.graphJson();

  // The graph needs audio and none is configured: the build throws.
  nlohmann::json needsAudio = Graph::builtInVideoGraph({"out-a"});
  needsAudio["nodes"].push_back({{"id", "mic"}, {"type", "audio.capture"}, {"params", nlohmann::json::object()}});
  std::string error;
  CHECK_FALSE(host.reloadInputs(registry, tunedVideoConfig(), dir.path, &needsAudio, error));
  CHECK(error.find("audio input") != std::string::npos);
  CHECK(*host.graphJson() == before);
  CHECK_FALSE(events->has("shutdown out-a replacement"));
  CHECK_FALSE(events->has("shutdown out-a final"));
  host.tick();
  CHECK(events->sendCount == 2);

  REQUIRE(host.pause());
  CHECK_FALSE(host.reloadInputs(registry, tunedVideoConfig(), dir.path, nullptr, error));
  CHECK(error == "no pipeline is running");
}


#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
namespace
{
  Config videoAndAudioConfig()
  {
    Config config = tunedVideoConfig();
    config.setActiveAudioInputName("fake-audio");
    return config;
  }

  nlohmann::json videoPlusMicGraph()
  {
    nlohmann::json doc = Graph::builtInVideoGraph({"out-a"});
    doc["nodes"].push_back({{"id", "mic"}, {"type", "audio.capture"}, {"params", nlohmann::json::object()}});
    return doc;
  }
}


TEST_CASE("Test on lights takes a both-input graph from a video-live effect and reverts it, with no output re-init (Aurora-4xqt.1)", "[LightTest][Audio]")
{
  LightTestHarness h("lt-inputs", videoAndAudioConfig());
  REQUIRE_FALSE(h.host->capabilities().usesAudioInput);
  const nlohmann::json both = videoPlusMicGraph();
  h.putDraft("editor", both);

  // A re-handshake would cost this per output; the input rebuild must not pay it.
  h.events->onOutputInit = []{ std::this_thread::sleep_for(300ms); };
  REQUIRE(h.events->videoOpened == 1);
  const std::size_t hints = h.events->widthHints.size();
  const auto started = std::chrono::steady_clock::now();
  REQUIRE(h.start("editor") == 200);
  CHECK(std::chrono::steady_clock::now() - started < 250ms);
  CHECK(*h.host->graphJson() == both);
  CHECK(h.host->capabilities().usesAudioInput);
  CHECK(h.host->summary().effect == "builtin.video");
  CHECK(initCount(*h.events) == 1);
  CHECK(initCount(*h.events, "out-b") == 1);
  // The screen capture stays open and untouched, only the audio input is new.
  CHECK(h.events->videoOpened == 1);
  CHECK(h.events->videoClosed == 0);
  CHECK(h.events->audioOpened == 1);
  CHECK(h.events->widthHints.size() == hints);
  CHECK(h.test->info().active);
  const int sends = h.events->sendCount;
  h.host->tick();
  CHECK(h.events->sendCount > sends);

  // The client goes silent: the lapse reverts through the same rebuild.
  h.advance(2000);
  CHECK(h.beat("editor") == 200);
  h.advance(5900);
  CHECK(*h.host->graphJson() == both);
  h.advance(200);
  CHECK(h.test->info().lastEnd == "heartbeat_lost");
  CHECK(*h.host->graphJson() == h.live);
  CHECK_FALSE(h.host->capabilities().usesAudioInput);
  CHECK(initCount(*h.events) == 1);
  CHECK(initCount(*h.events, "out-b") == 1);
  CHECK_FALSE(h.events->has("shutdown out-a replacement"));
  CHECK_FALSE(h.events->has("shutdown out-b replacement"));
  CHECK_FALSE(h.events->has("shutdown out-a final"));
  // The revert reuses the same capture and lets the audio input go.
  CHECK(h.events->videoOpened == 1);
  CHECK(h.events->videoClosed == 0);
  CHECK(h.events->audioOpened == 1);
  CHECK(h.events->audioClosed == 1);
  CHECK(h.events->widthHints.size() == hints);
}


TEST_CASE("Test on lights reverts to a custom live effect from an audio-only draft through the input rebuild (Aurora-4xqt.1)", "[LightTest][Audio]")
{
  LightTestHarness h("lt-inputs-custom", videoAndAudioConfig());
  h.putDraft("editor", Graph::builtInVideoGraph({"out-a"}));
  REQUIRE(h.post("/api/graph/apply", {{"session", "editor"}, {"id", "mine"}}) == 200);
  const nlohmann::json mine = *h.host->graphJson();

  const nlohmann::json sound = Graph::builtInAudioGraph({"out-a"});
  h.putDraft("editor", sound);
  REQUIRE(h.start("editor") == 200);
  CHECK(*h.host->graphJson() == sound);
  CHECK(h.host->summary().effect == "mine");
  CHECK(h.host->capabilities().usesAudioInput);
  CHECK_FALSE(h.host->capabilities().usesVideoInput);
  // The graph skips video, but the capture stays open for the revert.
  CHECK(h.events->videoOpened == 1);
  CHECK(h.events->videoClosed == 0);
  CHECK(h.events->audioOpened == 1);

  const std::size_t hints = h.events->widthHints.size();
  CHECK(h.post("/api/graph/test/revert", {{"session", "editor"}}) == 200);
  CHECK(*h.host->graphJson() == mine);
  CHECK(h.host->summary().effect == "mine");
  CHECK_FALSE(h.host->capabilities().usesAudioInput);
  CHECK(initCount(*h.events) == 1);
  CHECK_FALSE(h.events->has("shutdown out-a replacement"));
  // The revert took the parked capture back and let the audio input go.
  CHECK(h.events->videoOpened == 1);
  CHECK(h.events->videoClosed == 0);
  CHECK(h.events->audioClosed == 1);
  CHECK(h.events->widthHints.size() == hints);
}


TEST_CASE("PipelineHost::reloadInputs reuses an open input only when the Config still matches (Aurora-4xqt.1)", "[PipelineHost][Audio]")
{
  ScopedTempDir dir("reload-inputs-reuse");
  auto events = std::make_shared<Events>();
  auto registry = makeRegistry(events);
  const Config config = videoAndAudioConfig();
  PipelineHost host(Pipeline::build(registry, config, dir.path, {}), {});
  REQUIRE(events->videoOpened == 1);
  REQUIRE(events->audioOpened == 0);

  // Same Config: the capture is reused, no new open, no width hint.
  std::string error;
  const std::size_t hints = events->widthHints.size();
  REQUIRE(host.reloadInputs(registry, config, dir.path, nullptr, error));
  CHECK(events->videoOpened == 1);
  CHECK(events->videoClosed == 0);
  CHECK(events->widthHints.size() == hints);

  // A graph that adds audio opens only the audio input.
  nlohmann::json both = Graph::builtInVideoGraph({"out-a"});
  both["nodes"].push_back({{"id", "mic"}, {"type", "audio.capture"}, {"params", nlohmann::json::object()}});
  REQUIRE(host.reloadInputs(registry, config, dir.path, &both, error));
  CHECK(events->videoOpened == 1);
  CHECK(events->audioOpened == 1);

  // A different capture width means the open one was set up for something
  // else: a fresh input replaces it (and the unchanged audio one is reused).
  Config wider = config;
  wider.setSubsampleWidth(128);
  REQUIRE(host.reloadInputs(registry, wider, dir.path, &both, error));
  CHECK(events->videoOpened == 2);
  CHECK(events->videoClosed == 1);
  CHECK(events->audioOpened == 1);
  CHECK(events->audioClosed == 0);

  // An unset width (still to derive) never borrows.
  Config unset = wider;
  unset.setSubsampleWidth(0);
  REQUIRE(host.reloadInputs(registry, unset, dir.path, &both, error));
  CHECK(events->videoOpened == 3);
  CHECK(events->videoClosed == 2);
  host.shutdown();
}


TEST_CASE("The preview streams audio-only and both-input drafts while video is live, without touching the live pipeline (Aurora-4xqt.1)", "[Preview][Audio]")
{
  PreviewHarness h("preview-extra-audio", 20ms, videoAndAudioConfig());
  const std::uint64_t epoch = h.host->buildEpoch();

  h.putDraft("sound", Graph::builtInAudioGraph({"out-a"}));
  SseReader audio(h.port, "/api/graph/preview?session=sound");
  REQUIRE(audio.status() == 200);
  REQUIRE(audio.waitFor("event: preview\n"));
  CHECK(h.tickUntil(audio, [](const nlohmann::json& p){ return !p["outputs"].empty(); }));
  CHECK(eventsOf(audio.data(), "preview").back()["errors"].empty());

  h.putDraft("both", videoPlusMicGraph());
  SseReader both(h.port, "/api/graph/preview?session=both");
  REQUIRE(both.waitFor("event: preview\n"));
  CHECK(h.tickUntil(both, [](const nlohmann::json& p){ return !p["outputs"].empty(); }));
  CHECK(eventsOf(both.data(), "preview").back()["errors"].empty());

  // Live inputs, outputs and effect are as they were.
  CHECK(h.host->buildEpoch() == epoch);
  CHECK_FALSE(h.host->capabilities().usesAudioInput);
  CHECK(h.host->summary().effect == "builtin.video");
  CHECK(initCount(*h.events) == 1);
  CHECK_FALSE(h.events->has("shutdown out-a replacement"));
}


TEST_CASE("The preview opens a video input of its own when the live effect is audio-only (Aurora-4xqt.1)", "[Preview][Audio]")
{
  Config config = videoAndAudioConfig();
  config.setActiveEffectId("sound");
  PreviewHarness h("preview-extra-video", 20ms, config, [](const std::filesystem::path& root){
    std::string error;
    REQUIRE(EffectStore(root).write("sound", Graph::builtInAudioGraph({"out-a", "out-b"}), error));
  });
  REQUIRE(h.host->capabilities().usesAudioInput);
  REQUIRE_FALSE(h.host->capabilities().usesVideoInput);
  REQUIRE(h.events->widthHints.empty());

  h.putDraft("editor", gainGraph(1.f));
  SseReader reader(h.port, "/api/graph/preview?session=editor");
  REQUIRE(reader.status() == 200);
  REQUIRE(reader.waitFor("event: preview\n"));
  CHECK(h.tickUntil(reader, [](const nlohmann::json& p){ return !p["outputs"].empty() && firstRed(p) > 0.f; }));
  // Only the preview captures video: the live pipeline stays audio-only.
  CHECK_FALSE(h.events->widthHints.empty());
  CHECK_FALSE(h.host->capabilities().usesVideoInput);
  CHECK(initCount(*h.events) == 1);
}


TEST_CASE("A draft that grows a source the preview did not open gets draft_invalid, and a reconnect opens it (Aurora-4xqt.1)", "[Preview][Audio]")
{
  PreviewHarness h("preview-grows-source", 20ms, videoAndAudioConfig());
  h.putDraft("editor", gainGraph(1.f));
  SseReader reader(h.port, "/api/graph/preview?session=editor");
  REQUIRE(reader.waitFor("event: preview\n"));

  h.putDraft("editor", videoPlusMicGraph());
  CHECK(reader.waitFor("\"error\":\"draft_invalid\""));
  CHECK(reader.waitFor("reconnect the preview"));

  SseReader again(h.port, "/api/graph/preview?session=editor");
  REQUIRE(again.waitFor("event: preview\n"));
  CHECK(h.tickUntil(again, [](const nlohmann::json& p){ return !p["outputs"].empty(); }));
}
#endif


TEST_CASE("Every route aurora-mcp calls opens to an apply token, drafts to a draft token (Aurora-4xqt.15)", "[Pairing][Mcp]")
{
  using namespace Aurora::Network::Http::Server;
  auto service = std::make_shared<PairingService>();
  AccessGuard guard(service, [](const std::string& addr){ return addr == "127.0.0.1"; });
  addDraftAccessRules(guard);
  addApplyAccessRules(guard);
  addTestAccessRules(guard);
  addEffectsAccessRules(guard);

  const std::string read = service->mintForTest("viewer", Scope::Read);
  const std::string draft = service->mintForTest("editor", Scope::Draft);
  const std::string apply = service->mintForTest("adapter", Scope::Apply);

  auto decide = [&](HttpMethod method, const std::string& path, const std::string& token){
    AccessRequest request;
    request.method = method;
    request.path = path;
    request.remoteAddr = "192.168.1.20";
    request.authorization = "Bearer " + token;
    return guard.decide(request).result;
  };
  using Result = AccessDecision::Result;

  // Keep in step with the calls in adapters/mcp/src/McpServer.cpp. A new write
  // route without its own rule needs admin, which this catches.
  struct Call { HttpMethod method; const char* path; Scope needs; };
  const std::vector<Call> calls = {
    {HttpMethod::Get, "/api/state", Scope::Read},
    {HttpMethod::Get, "/api/capabilities", Scope::Read},
    {HttpMethod::Get, "/api/config", Scope::Read},
    {HttpMethod::Get, "/api/nodes", Scope::Read},
    {HttpMethod::Get, "/api/graph/presets", Scope::Read},
    {HttpMethod::Get, "/api/graph/presets/builtin-video", Scope::Read},
    {HttpMethod::Get, "/api/graph/drafts/mcp-1", Scope::Read},
    {HttpMethod::Get, "/api/graph/preview/summary", Scope::Read},
    {HttpMethod::Get, "/api/graph/test", Scope::Read},
    {HttpMethod::Get, "/api/effects", Scope::Read},
    {HttpMethod::Put, "/api/graph/drafts/mcp-1", Scope::Draft},
    {HttpMethod::Delete, "/api/graph/drafts/mcp-1", Scope::Draft},
    {HttpMethod::Post, "/api/graph/test", Scope::Apply},
    {HttpMethod::Post, "/api/graph/test/heartbeat", Scope::Apply},
    {HttpMethod::Post, "/api/graph/test/confirm", Scope::Apply},
    {HttpMethod::Post, "/api/graph/test/revert", Scope::Apply},
    {HttpMethod::Post, "/api/graph/apply", Scope::Apply},
    {HttpMethod::Put, "/api/effects", Scope::Apply},
  };
  for(const Call& call : calls){
    INFO(call.path);
    CHECK(decide(call.method, call.path, apply) == Result::Allow);
    CHECK(decide(call.method, call.path, draft) == (call.needs <= Scope::Draft ? Result::Allow : Result::Forbidden));
    CHECK(decide(call.method, call.path, read) == (call.needs <= Scope::Read ? Result::Allow : Result::Forbidden));
  }
}


namespace
{
  // The v1 read routes over a running video host with one custom effect.
  struct V1Harness
  {
    ScopedTempDir dir;
    std::shared_ptr<Events> events = std::make_shared<Events>();
    Registry registry = makeRegistry(events);
    DescriptorRegistry descriptors;
    std::unique_ptr<PipelineHost> host;
    Aurora::Network::Http::Server::HttpServer server;
    std::thread serverThread;
    std::unique_ptr<httplib::Client> client;
    int port{};

    explicit V1Harness(const std::string& name, Config config = videoConfig()) : dir(name)
    {
      descriptors.add("test", {ControlDescriptor{"video.sample", "bool", "A sample."}});
      std::string error;
      nlohmann::json mine = Graph::builtInVideoGraph({"out-a", "out-b"});
      mine["title"] = "Mine";
      EffectStore(dir.path).write("mine", mine, error);
      ConfigStore(dir.path).save(config);
      host = std::make_unique<PipelineHost>(Pipeline::build(registry, config, dir.path, {}), PipelineOptions{});
      registerPublicApiRoutes(server, *host, registry, dir.path, nullptr, nullptr, nullptr,
        {"test", "1.2.3", true, false, &descriptors});
      port = server.bindToAnyPort("127.0.0.1");
      REQUIRE(port > 0);
      serverThread = std::thread([this]{ server.listen(); });
      client = std::make_unique<httplib::Client>("127.0.0.1", port);
    }

    ~V1Harness()
    {
      host->shutdown();
      server.stop();
      serverThread.join();
    }

    nlohmann::json get(const std::string& path, int expectedStatus = 200)
    {
      auto result = getWithRetry(*client, path);
      REQUIRE(result);
      CHECK(result->status == expectedStatus);
      return nlohmann::json::parse(result->body);
    }
  };
}


TEST_CASE("GET /api/v1/state trims the internal fields and reports percent brightness (Aurora-5ipy.40)", "[PublicApi][v1]")
{
  Config config = videoConfig();
  config.setBrightness(0.7f);
  V1Harness h("v1-state", config);

  const nlohmann::json state = h.get("/api/v1/state");
  CHECK(state["state"] == "running");
  CHECK(state["effect"] == "builtin.video");
  CHECK(state["brightness"] == 70.0);
  CHECK(state["configuredInputs"] == nlohmann::json{{"video", "fake-video"}, {"audio", nullptr}});
  CHECK(state["errors"].is_array());
  CHECK(state.contains("samplesZones"));
  for(const char* internal : {"paused", "mcpEffectId", "canStop", "usesVideoInput", "usesAudioInput", "audioDevicesUrl"}){
    CHECK_FALSE(state.contains(internal));
  }
}


TEST_CASE("GET /api/v1/state reports a paused host as paused and an unset audio input as null (Aurora-5ipy.40)", "[PublicApi][v1]")
{
  V1Harness h("v1-state-paused");
  REQUIRE(h.host->pause());
  const nlohmann::json state = h.get("/api/v1/state");
  CHECK(state["state"] == "paused");
  CHECK(state["configuredInputs"]["audio"].is_null());
}


TEST_CASE("GET /api/v1/events opens with the v1 state and the health cut from it (Aurora-5ipy.40)", "[PublicApi][v1][Events]")
{
  V1Harness h("v1-events");
  SseReader reader(h.port, "/api/v1/events");
  REQUIRE(reader.status() == 200);
  REQUIRE(reader.waitFor("event: health\n"));

  const auto states = eventsOf(reader.data(), "state");
  REQUIRE(states.size() == 1);
  CHECK(states[0] == h.get("/api/v1/state"));
  CHECK(states[0].contains("configuredInputs"));

  const auto health = eventsOf(reader.data(), "health");
  REQUIRE(health.size() == 1);
  CHECK(health[0] == nlohmann::json{{"errors", nlohmann::json::array()}, {"conditions", nlohmann::json::array()}});
}


TEST_CASE("GET /api/v1/capabilities and version are the core helpers' answers (Aurora-5ipy.40)", "[PublicApi][v1]")
{
  V1Harness h("v1-host");

  const nlohmann::json caps = h.get("/api/v1/capabilities");
  CHECK(caps["platform"] == "test");
  CHECK(caps["inputs"] == nlohmann::json::array({"fake-video"}));
  // Registry::outputNames() is unordered, so compare as a set; "hue" is appended last.
  auto outputs = caps["outputs"].get<std::vector<std::string>>();
  REQUIRE(outputs.size() == 3);
  CHECK(outputs.back() == "hue");
  outputs.pop_back();
  std::sort(outputs.begin(), outputs.end());
  CHECK(outputs == std::vector<std::string>{"out-a", "out-b"});
  CHECK(caps["canSelectMonitor"] == false);
  CHECK_FALSE(caps.contains("paused"));

  CHECK(h.get("/api/v1/version") == nlohmann::json{{"version", "1.2.3"}, {"apiVersion", kApiVersion}});
}


namespace
{
  nlohmann::json patchState(LightTestHarness& h, const nlohmann::json& body, int expectedStatus = 200)
  {
    auto result = h.client->Patch("/api/v1/state", body.dump(), "application/json");
    REQUIRE(result);
    CHECK(result->status == expectedStatus);
    return nlohmann::json::parse(result->body);
  }

  // A saved custom effect that differs from the built-in, so a switch is visible.
  void saveEffect(LightTestHarness& h, const std::string& id)
  {
    nlohmann::json graph = Graph::builtInVideoGraph({"out-a"});
    graph["title"] = id;
    std::string error;
    REQUIRE(EffectStore(h.dir.path).write(id, graph, error));
  }
}


TEST_CASE("PATCH /api/v1/state saves an effect while paused and applies it on resume (Aurora-5ipy.42)", "[PublicApi][v1]")
{
  LightTestHarness h("v1-patch-paused");
  saveEffect(h, "mine");

  CHECK(patchState(h, {{"running", false}})["state"] == "paused");
  const nlohmann::json paused = patchState(h, {{"effect", "mine"}});
  CHECK(paused["state"] == "paused");
  CHECK(h.host->isPaused());
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "mine");

  const nlohmann::json resumed = patchState(h, {{"running", true}});
  CHECK(resumed["state"] == "running");
  CHECK(resumed["effect"] == "mine");
}


TEST_CASE("POST /api/v1/graph/save and /effects/:id/duplicate answer like the core routes (Aurora-pvxx.10)", "[PublicApi][v1]")
{
  LightTestHarness h("v1-save-duplicate");
  const nlohmann::json live = *h.host->graphJson();
  const nlohmann::json graph = Graph::builtInVideoGraph({"out-a", "out-b"});
  h.putDraft("s1", graph);

  auto post = [&](const std::string& path, const nlohmann::json& body){
    auto result = h.client->Post(path, body.dump(), "application/json");
    REQUIRE(result);
    return result;
  };

  auto saved = post("/api/v1/graph/save", {{"session", "s1"}, {"id", "kept"}});
  CHECK(saved->status == 200);
  const nlohmann::json savedBody = nlohmann::json::parse(saved->body);
  CHECK(savedBody["succeeded"] == true);
  CHECK(savedBody["id"] == "kept");
  CHECK(savedBody["activeEffectId"] == "");
  std::string error;
  CHECK(*EffectStore(h.dir.path).read("kept", error) == graph);
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "");
  CHECK(*h.host->graphJson() == live);

  CHECK(post("/api/v1/graph/save", {{"session", "s1"}, {"id", "builtin.video"}})->status == 400);
  CHECK(post("/api/v1/graph/save", {{"session", "none"}, {"id", "x"}})->status == 404);

  auto copied = post("/api/v1/effects/builtin.video/duplicate", {{"id", "screen-copy"}});
  CHECK(copied->status == 200);
  CHECK(nlohmann::json::parse(copied->body)["source"] == "builtin.video");
  const nlohmann::json builtIn = nlohmann::json::parse(h.client->Get("/api/v1/effects/builtin.video")->body);
  CHECK(*EffectStore(h.dir.path).read("screen-copy", error) == builtIn["graph"]);
  CHECK(post("/api/v1/effects/kept/duplicate", {{"id", "screen-copy"}})->status == 409);
  CHECK(post("/api/v1/effects/nope/duplicate", {{"id", "fresh"}})->status == 404);
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == "");
}


TEST_CASE("PATCH /api/v1/state applies brightness hot and keeps a test running (Aurora-5ipy.42)", "[PublicApi][v1]")
{
  LightTestHarness h("v1-patch-brightness");
  const nlohmann::json draft = Graph::builtInVideoGraph({"out-a"});
  h.putDraft("s1", draft);
  REQUIRE(h.start("s1") == 200);
  const int inits = initCount(*h.events);

  const nlohmann::json state = patchState(h, {{"brightness", 25}});
  CHECK(state["state"] == "running");
  CHECK(state["brightness"] == 25.0);
  CHECK(state["test"]["active"] == true);
  CHECK(ConfigStore(h.dir.path).load().brightness() == Catch::Approx(0.25f));
  CHECK(h.test->info().active);
  CHECK(*h.host->graphJson() == draft);
  CHECK(initCount(*h.events) == inits);
}


TEST_CASE("PATCH /api/v1/state ends a running test as superseded on an effect or a pause (Aurora-5ipy.42)", "[PublicApi][v1]")
{
  LightTestHarness h("v1-patch-superseded");
  saveEffect(h, "mine");
  h.putDraft("s1", Graph::builtInVideoGraph({"out-a"}));

  REQUIRE(h.start("s1") == 200);
  CHECK(patchState(h, {{"effect", "mine"}})["effect"] == "mine");
  CHECK_FALSE(h.test->info().active);
  CHECK(h.test->info().lastEnd == "superseded");

  REQUIRE(h.start("s1") == 200);
  CHECK(patchState(h, {{"running", false}})["state"] == "paused");
  CHECK(h.test->info().lastEnd == "superseded");
}


TEST_CASE("PATCH /api/v1/state validates every field first and writes nothing on a bad one (Aurora-5ipy.42)", "[PublicApi][v1]")
{
  LightTestHarness h("v1-patch-invalid");
  const std::string before = ConfigStore(h.dir.path).load().activeEffectId();

  const nlohmann::json bad = patchState(h, {{"brightness", 40}, {"effect", "nope"}, {"errors", nlohmann::json::array()}, {"bogus", 1}}, 400);
  REQUIRE(bad["errors"].size() == 3);
  CHECK(bad["code"] == bad["errors"][0]["code"]);
  std::set<std::string> codes;
  for(const auto& issue : bad["errors"]){ codes.insert(issue["code"]); }
  CHECK(codes == std::set<std::string>{"read_only_field", "unknown_field", "unknown_effect"});
  CHECK(ConfigStore(h.dir.path).load().brightness() == 1.f);
  CHECK(ConfigStore(h.dir.path).load().activeEffectId() == before);

  CHECK(patchState(h, {{"running", nullptr}}, 400)["code"] == "null_not_allowed");
  CHECK(patchState(h, {{"running", "yes"}}, 400)["code"] == "invalid_field");
  CHECK(patchState(h, {{"brightness", 101}}, 400)["code"] == "invalid_field");
  CHECK(patchState(h, {{"brightness", -1}}, 400)["code"] == "invalid_field");
  CHECK(patchState(h, nlohmann::json::array(), 400)["code"] == "invalid_body");
  CHECK_FALSE(h.host->isPaused());
}


TEST_CASE("GET /api/v1/effects and effects/:id answer the effect documents (Aurora-5ipy.40)", "[PublicApi][v1]")
{
  V1Harness h("v1-effects");

  const nlohmann::json list = h.get("/api/v1/effects");
  REQUIRE(list["effects"].size() == 3);
  CHECK(list["effects"][2] == nlohmann::json{{"id", "mine"}, {"builtin", false}, {"title", "Mine"}, {"description", nullptr}});
  CHECK(list["activeEffectId"] == "");
  CHECK(list["effect"] == "builtin.video");

  CHECK(h.get("/api/v1/effects/mine")["graph"]["title"] == "Mine");
  CHECK(h.get("/api/v1/effects/builtin.video")["builtin"] == true);
  CHECK(h.get("/api/v1/effects/nope", 404)["error"] == "unknown_effect");
}


TEST_CASE("GET /api/v1/descriptors serves the registry payload (Aurora-5ipy.40)", "[PublicApi][v1]")
{
  V1Harness h("v1-descriptors");
  CHECK(h.get("/api/v1/descriptors") == h.descriptors.toJson());
}


TEST_CASE("the v1 read routes need read scope from a LAN caller (Aurora-5ipy.40)", "[PublicApi][v1]")
{
  using namespace Aurora::Network::Http::Server;
  AccessGuard guard(std::make_shared<PairingService>());
  for(const char* path : {"/api/v1/state", "/api/v1/events", "/api/v1/capabilities", "/api/v1/version",
                          "/api/v1/effects", "/api/v1/effects/mine", "/api/v1/descriptors"}){
    AccessRequest request;
    request.method = HttpMethod::Get;
    request.path = path;
    request.remoteAddr = "192.168.1.50";
    CHECK(guard.decide(request).result == AccessDecision::Result::Unauthorized);
  }
}
