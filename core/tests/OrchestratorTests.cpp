#include <catch2/catch_test_macros.hpp>

#include <Aurora/Runtime/Orchestrator.hpp>
#include <Aurora/Runtime/SubsampleDefaults.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Output;
using namespace Aurora::Runtime;


namespace
{
  // Self-cleaning temp directory for ZoneMapStore/ConfigStore's real file I/O.
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-orchestrator-tests-" + name))
    {
      std::filesystem::remove_all(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  // 4x2 image, left half red / right half blue -- lets a zone map pick out
  // a known color per half. No display/OS dependency, unlike a real grabber.
  class FakeInput : public IVideoInput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "FakeInput";
      return s_name;
    }

    Resolution displayResolution() const override { return {4, 2}; }
    RefreshRate displayRefreshRate() const override { return 30; }

    void grabFrameSubsample(ImageData& imageData) override
    {
      if(!hasFrame){
        imageData = ImageData{};
        return;
      }

      imageData.format = PixelFormat::RGB;
      imageData.imageMatrix = cv::Mat(2, 4, CV_8UC3, cv::Scalar(0, 0, 0));
      imageData.imageMatrix(cv::Rect(0, 0, 2, 2)).setTo(cv::Scalar(255, 0, 0));
      imageData.imageMatrix(cv::Rect(2, 0, 2, 2)).setTo(cv::Scalar(0, 0, 255));
    }

    bool hasFrame{true};
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
    void shutdown() override { m_connected = false; }
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


TEST_CASE("pickDefaultSubsampleWidth picks the cheapest candidate clearing the threshold", "[SubsampleDefaults]")
{
  std::vector<glm::ivec2> candidates{{1920, 1080}, {960, 540}, {192, 108}, {19, 11}};

  // 192 is the smallest candidate that's still >= 10% of 1920.
  CHECK(pickDefaultSubsampleWidth(candidates, 1920, 10.f) == 192);
}


TEST_CASE("pickDefaultSubsampleWidth falls back to the smallest candidate if none clear the threshold", "[SubsampleDefaults]")
{
  std::vector<glm::ivec2> candidates{{100, 50}, {10, 5}};
  CHECK(pickDefaultSubsampleWidth(candidates, 100000, 50.f) == 10);
}


TEST_CASE("pickDefaultSubsampleWidth returns 0 for an empty candidate list", "[SubsampleDefaults]")
{
  CHECK(pickDefaultSubsampleWidth({}, 1920) == 0);
}


TEST_CASE("Orchestrator::init derives refreshRate/subsampleWidth from the display when unset", "[Orchestrator]")
{
  ScopedTempDir dir("init-defaults");
  FakeInput input;
  FakeOutput output("fake", {});

  Orchestrator orchestrator(input, {&output}, Config{}, ZoneMapStore(dir.path));
  orchestrator.init();

  CHECK(orchestrator.config().refreshRate() == 30); // from displayRefreshRate()
  CHECK(orchestrator.config().subsampleWidth() > 0);
}


TEST_CASE("Orchestrator::init reconciles and persists each output's zone map", "[Orchestrator]")
{
  ScopedTempDir dir("init-reconcile");
  FakeInput input;
  FakeOutput output("fake", {1, 2});

  Orchestrator orchestrator(input, {&output}, Config{}, ZoneMapStore(dir.path));
  orchestrator.init();

  const ZoneMap& zoneMap = orchestrator.zoneMap("fake");
  REQUIRE(zoneMap.size() == 2);
  CHECK_FALSE(zoneMap[0].active); // no saved profile yet -- defaults inactive

  // Persisted immediately, not just held in memory.
  ZoneMapStore reread(dir.path);
  CHECK(reread.load("fake").size() == 2);
}


TEST_CASE("Orchestrator::update crops per zone and sends a smoothed Frame to each output", "[Orchestrator]")
{
  ScopedTempDir dir("update");
  FakeInput input;
  FakeOutput output("fake", {1, 2});

  Orchestrator orchestrator(input, {&output}, Config{}, ZoneMapStore(dir.path));
  orchestrator.init();

  // Activate both zones with a saved mapping matching the fixture's halves,
  // then re-init() so the orchestrator reloads and reconciles against it.
  ZoneMapStore(dir.path).save("fake", ZoneMap{
    {1, {{0.f, 0.f}, {0.5f, 1.f}}, true},
    {2, {{0.5f, 0.f}, {1.f, 1.f}}, true}
  });
  orchestrator.init();
  orchestrator.update();

  REQUIRE(output.sendCount == 1);
  REQUIRE(output.lastFrame.size() == 2);
  CHECK(output.lastFrame[0].color == Color(255, 0, 0));
  CHECK(output.lastFrame[1].color == Color(0, 0, 255));
}


TEST_CASE("Orchestrator::update is a no-op when the input has no frame yet", "[Orchestrator]")
{
  ScopedTempDir dir("no-frame");
  FakeInput input;
  input.hasFrame = false;
  FakeOutput output("fake", {1});

  Orchestrator orchestrator(input, {&output}, Config{}, ZoneMapStore(dir.path));
  orchestrator.init();
  orchestrator.update();

  CHECK(output.sendCount == 0);
}


TEST_CASE("Orchestrator::updateZone edits only the fields given, live and persisted", "[Orchestrator]")
{
  ScopedTempDir dir("update-zone");
  FakeInput input;
  FakeOutput output("fake", {1, 2});

  Orchestrator orchestrator(input, {&output}, Config{}, ZoneMapStore(dir.path));
  orchestrator.init();

  UVs newUvs{{0.1f, 0.2f}, {0.3f, 0.4f}};
  CHECK(orchestrator.updateZone("fake", 1, newUvs, true, 0.5f));

  const ZoneMap& zoneMap = orchestrator.zoneMap("fake");
  REQUIRE(zoneMap.size() == 2);
  CHECK(zoneMap[0].uvs.min == glm::vec2(0.1f, 0.2f));
  CHECK(zoneMap[0].uvs.max == glm::vec2(0.3f, 0.4f));
  CHECK(zoneMap[0].active);
  CHECK(zoneMap[0].gamma == 0.5f);
  CHECK_FALSE(zoneMap[1].active); // untouched

  // Omitted fields (nullopt) leave the existing value alone.
  CHECK(orchestrator.updateZone("fake", 1, std::nullopt, false, std::nullopt));
  CHECK(orchestrator.zoneMap("fake")[0].uvs.min == glm::vec2(0.1f, 0.2f)); // still the earlier edit
  CHECK_FALSE(orchestrator.zoneMap("fake")[0].active);
  CHECK(orchestrator.zoneMap("fake")[0].gamma == 0.5f);

  // Persisted immediately, not just held in memory.
  ZoneMapStore reread(dir.path);
  ZoneMap persisted = reread.load("fake");
  REQUIRE(persisted.size() == 2);
  CHECK(persisted[0].uvs.min == glm::vec2(0.1f, 0.2f));
}


TEST_CASE("Orchestrator::updateZone returns false for an unknown output or zoneId", "[Orchestrator]")
{
  ScopedTempDir dir("update-zone-unknown");
  FakeInput input;
  FakeOutput output("fake", {1});

  Orchestrator orchestrator(input, {&output}, Config{}, ZoneMapStore(dir.path));
  orchestrator.init();

  CHECK_FALSE(orchestrator.updateZone("not-a-real-output", 1, std::nullopt, true, std::nullopt));
  CHECK_FALSE(orchestrator.updateZone("fake", 99, std::nullopt, true, std::nullopt));
}
