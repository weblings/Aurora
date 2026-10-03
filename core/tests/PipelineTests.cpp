#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <functional>
#include <future>
#include <memory>
#include <stdexcept>
#include <thread>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/PipelineRoutes.hpp>
#include <Aurora/Runtime/SettingsRoutes.hpp>

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
    {}

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

  private:
    std::shared_ptr<Events> m_events;
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
  REQUIRE(server.bind("127.0.0.1", 18228));
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18228);
  auto put = [&](const std::string& body){ return client.Put("/api/state", body, "application/json"); };

  for(int i = 0; i < 2; ++i){
    auto paused = put(R"({"running":false})");
    REQUIRE(paused);
    CHECK(paused->status == 200);
    CHECK(nlohmann::json::parse(paused->body) == nlohmann::json{{"succeeded", true}, {"running", false}});
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
  CHECK(nlohmann::json::parse(failed->body)["error"] == "Unknown input 'nope'");
  CHECK(host.isPaused());

  ConfigStore(dir.path).save(videoConfig());
  for(int i = 0; i < 2; ++i){
    auto resumed = put(R"({"running":true})");
    REQUIRE(resumed);
    CHECK(nlohmann::json::parse(resumed->body) == nlohmann::json{{"succeeded", true}, {"running", true}});
    CHECK_FALSE(host.isPaused());
  }

  server.stop();
  serverThread.join();
  host.shutdown();
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
  REQUIRE(server.bind("127.0.0.1", 18229));
  std::thread serverThread([&](){ server.listen(); });

  httplib::Client client("127.0.0.1", 18229);
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


TEST_CASE("Concurrent settings PUTs run one at a time and none is lost (Aurora-d6i7)", "[SettingsRoutes]")
{
  using namespace Aurora::Network::Http::Server;

  ScopedTempDir dir("settings-put");

  std::atomic<int> inFlight{0};
  std::atomic<int> maxInFlight{0};
  std::atomic<int> calls{0};

  HttpServer server;
  registerSettingsRoutes(server, dir.path, [&]() -> std::string{
    int now = ++inFlight;
    int seen = maxInFlight.load();
    while(now > seen && !maxInFlight.compare_exchange_weak(seen, now)){}
    std::this_thread::sleep_for(20ms); // a slow reload, the case that matters
    --inFlight;
    ++calls;
    return {};
  });
  REQUIRE(server.bind("127.0.0.1", 18228));
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
    httplib::Client probe("127.0.0.1", 18228);
    REQUIRE(getWithRetry(probe, "/api/config"));
  }

  // Catch2's assertions aren't thread-safe here, so the client threads only
  // count successes and the checks run on this thread.
  std::atomic<int> succeeded{0};
  std::vector<std::thread> clients;
  for(const auto& [field, value] : patches){
    clients.emplace_back([&, field = field, value = value]{
      httplib::Client client("127.0.0.1", 18228);
      auto response = client.Put("/api/config", nlohmann::json{{field, value}}.dump(), "application/json");
      if(response && response->status == 200){ ++succeeded; }
    });
  }
  for(auto& client : clients){ client.join(); }

  server.stop();
  serverThread.join();

  CHECK(succeeded == static_cast<int>(patches.size()));
  CHECK(calls == static_cast<int>(patches.size()));
  CHECK(maxInFlight == 1);

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
