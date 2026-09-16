#include <catch2/catch_test_macros.hpp>

#include <Aurora/Runtime/AudioOrchestrator.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Output;
using namespace Aurora::Runtime;


namespace
{
  // Self-cleaning temp directory for ZoneMapStore's real file I/O.
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-audio-orchestrator-tests-" + name))
    {
      std::filesystem::remove_all(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  class FakeAudioInput : public IAudioInput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "FakeAudioInput";
      return s_name;
    }

    void readNextBuffer(AudioBuffer& buffer) override
    {
      if(!hasBuffer){
        buffer = AudioBuffer{};
        return;
      }

      buffer.sampleRate = 44100;
      buffer.channelCount = 1;
      buffer.samples = {0.5f, -0.5f, 0.5f, -0.5f};
    }

    bool hasBuffer{true};
  };


  class FakeOutput : public IOutput
  {
  public:
    explicit FakeOutput(std::string name, std::vector<uint8_t> liveZoneIds):
    m_name(std::move(name)),
    m_liveZoneIds(std::move(liveZoneIds))
    {}

    const std::string& name() const override { return m_name; }
    void init() override { m_connected = true; }
    bool isConnected() const override { return m_connected; }
    void shutdown(bool) override { m_connected = false; }
    std::vector<uint8_t> zoneIds() const override { return m_liveZoneIds; }

    void send(const Frame& frame) override
    {
      lastFrame = frame;
      sendCount++;
    }

    Frame lastFrame;
    int sendCount{0};

  private:
    std::string m_name;
    std::vector<uint8_t> m_liveZoneIds;
    bool m_connected{false};
  };
}


TEST_CASE("AudioOrchestrator::init reconciles and persists each output's zone map", "[AudioOrchestrator]")
{
  ScopedTempDir dir("init-reconcile");
  FakeAudioInput input;
  FakeOutput output("fake", {1, 2});

  AudioOrchestrator orchestrator(input, {&output}, ZoneMapStore(dir.path), {});
  orchestrator.init();

  const ZoneMap& zoneMap = orchestrator.zoneMap("fake");
  REQUIRE(zoneMap.size() == 2);
  CHECK_FALSE(zoneMap[0].active); // no saved profile yet -- defaults inactive

  ZoneMapStore reread(dir.path);
  CHECK(reread.load("fake").size() == 2);
}


TEST_CASE("AudioOrchestrator::update broadcasts the same color to every active zone", "[AudioOrchestrator]")
{
  ScopedTempDir dir("update-broadcast");
  FakeAudioInput input;
  FakeOutput output("fake", {1, 2});

  AudioOrchestrator orchestrator(input, {&output}, ZoneMapStore(dir.path), {});
  orchestrator.init();

  ZoneMapStore(dir.path).save("fake", ZoneMap{
    {1, {{0.f, 0.f}, {1.f, 1.f}}, true},
    {2, {{0.f, 0.f}, {1.f, 1.f}}, true}
  });
  orchestrator.init();
  orchestrator.update(1.0f);

  REQUIRE(output.sendCount == 1);
  REQUIRE(output.lastFrame.size() == 2);
  // Same color to both zones -- no per-zone spatial concept exists for audio.
  CHECK(output.lastFrame[0].color == output.lastFrame[1].color);
}


TEST_CASE("AudioOrchestrator::update omits inactive zones, same convention as composeFrame", "[AudioOrchestrator]")
{
  ScopedTempDir dir("update-inactive");
  FakeAudioInput input;
  FakeOutput output("fake", {1, 2});

  AudioOrchestrator orchestrator(input, {&output}, ZoneMapStore(dir.path), {});
  orchestrator.init();

  ZoneMapStore(dir.path).save("fake", ZoneMap{
    {1, {{0.f, 0.f}, {1.f, 1.f}}, true},
    {2, {{0.f, 0.f}, {1.f, 1.f}}, false}
  });
  orchestrator.init();
  orchestrator.update(1.0f);

  REQUIRE(output.lastFrame.size() == 1);
  CHECK(output.lastFrame[0].id == 1);
}


TEST_CASE("AudioOrchestrator::update is a no-op when the input has no buffer yet", "[AudioOrchestrator]")
{
  ScopedTempDir dir("no-buffer");
  FakeAudioInput input;
  input.hasBuffer = false;
  FakeOutput output("fake", {1});

  AudioOrchestrator orchestrator(input, {&output}, ZoneMapStore(dir.path), {});
  orchestrator.init();
  orchestrator.update(1.0f);

  CHECK(output.sendCount == 0);
}
