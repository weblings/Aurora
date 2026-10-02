#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <memory>
#include <stdexcept>
#include <thread>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/PipelineRoutes.hpp>

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

    bool has(const std::string& line) const
    {
      return std::find(lines.begin(), lines.end(), line) != lines.end();
    }
  };


  class FakeVideoInput : public IVideoInput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "fake-video";
      return s_name;
    }

    bool hasCustomScreenManagement() const override { return true; }
    Resolution displayResolution() const override { return {4, 2}; }
    RefreshRate displayRefreshRate() const override { return 30; }

    void grabFrameSubsample(ImageData& imageData) override
    {
      imageData.format = PixelFormat::RGB;
      imageData.imageMatrix = cv::Mat(2, 4, CV_8UC3, cv::Scalar(255, 0, 0));
    }

  protected:
    void _initMonitorsList() override
    {
      m_monitorSelectionData.monitors.push_back(
        std::make_shared<MonitorData>("Fake Monitor", 4, 2, 30.0, true)
      );
    }
  };


  class FakeAudioInput : public IAudioInput
  {
  public:
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
  };


  class FakeOutput : public IOutput
  {
  public:
    FakeOutput(std::string name, std::shared_ptr<Events> events):
    m_name(std::move(name)),
    m_events(std::move(events))
    {}

    const std::string& name() const override { return m_name; }
    void init() override { m_connected = true; m_events->lines.push_back("init " + m_name); }
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
    registry.registerInput("fake-video", []{ return std::make_unique<FakeVideoInput>(); });
    registry.registerAudioInput("fake-audio", []{ return std::make_unique<FakeAudioInput>(); });
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
  REQUIRE(server.bind("127.0.0.1", 18227));
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18227);

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
  CHECK(failedJson["error"] == "Unknown input 'nope'");

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
