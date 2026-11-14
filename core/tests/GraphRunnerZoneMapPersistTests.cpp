#include <catch2/catch_test_macros.hpp>

#include <filesystem>

#include <Aurora/Runtime/GraphRunner.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Output;
using namespace Aurora::Runtime;


namespace
{
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-zonemap-persist-tests-" + name))
    {
      std::filesystem::remove_all(path);
    }

    ~ScopedTempDir() { std::filesystem::remove_all(path); }
  };


  class StubInput : public IVideoInput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "StubInput";
      return s_name;
    }

    Resolution displayResolution() const override { return {4, 2}; }
    RefreshRate displayRefreshRate() const override { return 30; }

    void grabFrameSubsample(ImageData& imageData) override
    {
      imageData.format = PixelFormat::RGB;
      imageData.imageMatrix = cv::Mat(2, 4, CV_8UC3, cv::Scalar(0, 0, 0));
    }

    std::uint64_t frameSerial() const override { return 0; }
  };


  // zoneIds is settable, standing in for a Hue output built with the bridge
  // down (none) that later reports its entertainment zones.
  class SettableZonesOutput : public IOutput
  {
  public:
    const std::string& name() const override { return m_name; }
    void init() override { m_connected = true; }
    bool isConnected() const override { return m_connected; }
    void shutdown(bool) override { m_connected = false; }
    std::vector<uint8_t> zoneIds() const override { return liveZoneIds; }
    void send(const Frame& frame) override { lastFrame = frame; sendCount++; }

    std::vector<uint8_t> liveZoneIds;
    Frame lastFrame;
    int sendCount{0};

  private:
    std::string m_name{"fake"};
    bool m_connected{false};
  };


  ZoneMap savedFixture()
  {
    return ZoneMap{
      {1, {{0.f, 0.f}, {0.5f, 1.f}}, true, 1.f, true},
      {2, {{0.5f, 0.f}, {1.f, 1.f}}, false, 2.f, true}
    };
  }
}


TEST_CASE("GraphRunner init leaves the saved zone map untouched when the output reports no zone ids", "[GraphRunner][ZoneMapStore]")
{
  ScopedTempDir dir("save-skipped");
  StubInput input;
  SettableZonesOutput output;

  ZoneMapStore store(dir.path);
  store.save("fake", savedFixture());

  GraphRunner runner(input, {&output}, Config{}, ZoneMapStore(dir.path));
  runner.init();

  CHECK(runner.zoneMap("fake").empty());

  const ZoneMap onDisk = store.load("fake");
  REQUIRE(onDisk.size() == 2);
  CHECK(onDisk[0].zoneId == 1);
  CHECK(onDisk[0].uvs.max.x == 0.5f);
  CHECK(onDisk[1].zoneId == 2);
  CHECK_FALSE(onDisk[1].active);
  CHECK(onDisk[1].everConfigured);

  runner.tick(1.0f / 60.0f);
  CHECK(output.lastFrame.empty());  // an empty frame may be sent; no zone colors
}


TEST_CASE("GraphRunner re-init reconciles against the saved zone map once the output reports its zones", "[GraphRunner][ZoneMapStore]")
{
  ScopedTempDir dir("recovery");
  StubInput input;
  SettableZonesOutput output;

  ZoneMapStore store(dir.path);
  store.save("fake", savedFixture());

  GraphRunner runner(input, {&output}, Config{}, ZoneMapStore(dir.path));
  runner.init();
  REQUIRE(runner.zoneMap("fake").empty());

  output.liveZoneIds = {1, 2};
  runner.init();

  const ZoneMap& map = runner.zoneMap("fake");
  REQUIRE(map.size() == 2);
  CHECK(map[0].uvs.max.x == 0.5f);
  CHECK(map[0].everConfigured);
  CHECK(map[1].zoneId == 2);
  CHECK_FALSE(map[1].active);
  CHECK(map[1].gamma == 2.f);
}
