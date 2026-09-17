#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/FrameCompositor.hpp>
#include <Aurora/Runtime/MonitorSelector.hpp>
#include <Aurora/Runtime/Smoother.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>
#include <Aurora/Runtime/ZoneReconciler.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Runtime;


namespace
{
  // Self-cleaning temp directory for ConfigStore/ZoneMapStore's real file I/O.
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-runtime-tests-" + name))
    {
      std::filesystem::remove_all(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  ImageData makeSolidColor(int width, int height, uint8_t r, uint8_t g, uint8_t b)
  {
    ImageData imageData;
    imageData.format = PixelFormat::RGB;
    imageData.imageMatrix = cv::Mat(height, width, CV_8UC3, cv::Scalar(r, g, b));
    return imageData;
  }
}


TEST_CASE("Config setters clamp the same way huenicorn's did", "[Config]")
{
  Config config;

  config.setRefreshRate(0);
  CHECK(config.refreshRate() == 1);

  config.setTransitionSmoothing(5.f);
  CHECK(config.transitionSmoothing() == Catch::Approx(0.97f));

  config.setTransitionSmoothing(-1.f);
  CHECK(config.transitionSmoothing() == Catch::Approx(0.f));
}


TEST_CASE("ConfigStore round-trips through a real file and defaults on missing file", "[ConfigStore]")
{
  ScopedTempDir dir("config");
  ConfigStore store(dir.path);

  Config loaded = store.load();
  CHECK(loaded.restServerPort() == 8215); // ConfigData's default, no file exists yet

  Config toSave;
  toSave.setRefreshRate(30);
  toSave.setSubsampleWidth(64);
  toSave.setTransitionSmoothing(0.5f);
  toSave.setInterpolation(Interpolation::Type::Nearest);
  toSave.setActiveInputName("x11");
  toSave.setActiveOutputNames({"hue", "dmx"});
  toSave.setActiveMonitorName("\\\\.\\DISPLAY1");
  store.save(toSave);

  Config reloaded = store.load();
  CHECK(reloaded.refreshRate() == 30);
  CHECK(reloaded.subsampleWidth() == 64);
  CHECK(reloaded.transitionSmoothing() == Catch::Approx(0.5f));
  CHECK(reloaded.interpolation() == Interpolation::Type::Nearest);
  CHECK(reloaded.activeInputName() == "x11");
  CHECK(reloaded.activeOutputNames() == std::vector<std::string>{"hue", "dmx"});
  CHECK(reloaded.activeMonitorName() == "\\\\.\\DISPLAY1");
}


namespace
{
  // Mirrors X11Grabber/WindowsGrabber's monitor-list shape without needing
  // a real display -- PipewireGrabber has no equivalent (Wayland's portal
  // picks the screen itself), so it never overrides these.
  struct FakeMultiMonitorInput : public IVideoInput
  {
    const std::string& name() const override
    {
      static const std::string s_name = "FakeMultiMonitorInput";
      return s_name;
    }

    bool hasCustomScreenManagement() const override { return true; }
    Resolution displayResolution() const override { return {1, 1}; }
    RefreshRate displayRefreshRate() const override { return 60; }
    void grabFrameSubsample(ImageData&) override {}

    void selectMonitor(unsigned monitorId) override
    {
      lastSelectedMonitorId = monitorId;
      m_monitorSelectionData.selectedMonitorId = monitorId;
    }

    std::optional<unsigned> lastSelectedMonitorId;

  protected:
    void _initMonitorsList() override
    {
      m_monitorSelectionData.monitors = {
        std::make_shared<MonitorData>("Primary", 1920, 1080, 60.0, true),
        std::make_shared<MonitorData>("Secondary", 1280, 720, 60.0, false)
      };
      m_monitorSelectionData.selectedMonitorId = 0;
    }
  };
}


TEST_CASE("selectConfiguredMonitor resolves a saved name to the matching monitor", "[MonitorSelector]")
{
  FakeMultiMonitorInput input;
  input.init(); // populates monitors() via _initMonitorsList()

  Config config;
  config.setActiveMonitorName("Secondary");
  selectConfiguredMonitor(input, config);

  REQUIRE(input.lastSelectedMonitorId.has_value());
  CHECK(input.lastSelectedMonitorId.value() == 1);
}


TEST_CASE("selectConfiguredMonitor is a no-op for an empty or unmatched name", "[MonitorSelector]")
{
  FakeMultiMonitorInput input;
  input.init();

  selectConfiguredMonitor(input, Config{}); // empty activeMonitorName -- auto/primary
  CHECK_FALSE(input.lastSelectedMonitorId.has_value());

  Config unmatched;
  unmatched.setActiveMonitorName("Nonexistent");
  selectConfiguredMonitor(input, unmatched);
  CHECK_FALSE(input.lastSelectedMonitorId.has_value());
}


TEST_CASE("ZoneMapStore keeps each plugin's profile in its own file", "[ZoneMapStore]")
{
  ScopedTempDir dir("zonemap");
  ZoneMapStore store(dir.path);

  CHECK(store.load("hue").empty()); // no profile saved yet

  ZoneMap hueZones{
    {1, {{0.f, 0.f}, {0.5f, 1.f}}, true, 0.5f, true},
    {2, {{0.5f, 0.f}, {1.f, 1.f}}, false}
  };
  store.save("hue", hueZones);

  ZoneMap loaded = store.load("hue");
  REQUIRE(loaded.size() == 2);
  CHECK(loaded[0].zoneId == 1);
  CHECK(loaded[0].active);
  CHECK(loaded[0].uvs.max.x == Catch::Approx(0.5f));
  CHECK(loaded[0].gamma == Catch::Approx(0.5f));
  CHECK(loaded[0].everConfigured);
  CHECK_FALSE(loaded[1].active);
  CHECK(loaded[1].gamma == Catch::Approx(0.f)); // default when not set
  CHECK_FALSE(loaded[1].everConfigured); // default when not set

  // A different plugin's profile is untouched by hue's save.
  CHECK(store.load("dmx").empty());
}


TEST_CASE("reconcileZoneMap keeps saved mappings, defaults new zones active-but-unconfigured, drops stale ones", "[ZoneReconciler]")
{
  ZoneMap saved{
    {1, {{0.1f, 0.1f}, {0.4f, 0.4f}}, true, 0.f, true},
    {9, {{0.f, 0.f}, {1.f, 1.f}}, true} // no longer reported live below
  };

  ZoneMap reconciled = reconcileZoneMap(saved, {1, 2});

  REQUIRE(reconciled.size() == 2);

  CHECK(reconciled[0].zoneId == 1);
  CHECK(reconciled[0].active);
  CHECK(reconciled[0].everConfigured);
  CHECK(reconciled[0].uvs.max.x == Catch::Approx(0.4f));

  CHECK(reconciled[1].zoneId == 2);
  CHECK(reconciled[1].active); // new zone, no saved mapping -- active is the default
  CHECK_FALSE(reconciled[1].everConfigured); // but never actually written
}


TEST_CASE("composeFrame crops active zones and omits inactive ones", "[FrameCompositor]")
{
  // 4x2 image: left half red, right half blue.
  ImageData source = makeSolidColor(4, 2, 0, 0, 0);
  source.imageMatrix(cv::Rect(0, 0, 2, 2)).setTo(cv::Scalar(255, 0, 0));
  source.imageMatrix(cv::Rect(2, 0, 2, 2)).setTo(cv::Scalar(0, 0, 255));

  ZoneMap zoneMap{
    {1, {{0.f, 0.f}, {0.5f, 1.f}}, true, 0.7f},   // left half, active
    {2, {{0.5f, 0.f}, {1.f, 1.f}}, false}         // right half, inactive
  };

  Frame frame = composeFrame(source, zoneMap);

  REQUIRE(frame.size() == 1);
  CHECK(frame[0].id == 1);
  CHECK(frame[0].color == Color(255, 0, 0));
  CHECK(frame[0].gamma == Catch::Approx(0.7f)); // carried through from the zone map
}


TEST_CASE("Smoother carries gamma through unchanged -- only color is eased", "[Smoother]")
{
  Smoother smoother;
  Frame frame{{1, Color(0, 0, 0), 0.6f}};

  Frame first = smoother.smooth("hue", frame, 0.5f);
  CHECK(first[0].gamma == Catch::Approx(0.6f));

  Frame second = smoother.smooth("hue", {{1, Color(255, 255, 255), 0.6f}}, 0.5f);
  CHECK(second[0].gamma == Catch::Approx(0.6f));
}


TEST_CASE("Smoother reproduces instant behavior when smoothing is 0", "[Smoother]")
{
  Smoother smoother;
  Frame frame{{1, Color(200, 100, 50)}};

  Frame first = smoother.smooth("hue", frame, 0.f);
  CHECK(first[0].color == Color(200, 100, 50));

  Frame second = smoother.smooth("hue", {{1, Color(0, 0, 0)}}, 0.f);
  CHECK(second[0].color == Color(0, 0, 0));
}


TEST_CASE("Smoother eases toward the new color instead of snapping when smoothing > 0", "[Smoother]")
{
  Smoother smoother;

  // First tick for this (outputId, zoneId) has no previous color -- takes
  // the measured value directly, same as huenicorn's hasPreviousXyb==false.
  Frame first = smoother.smooth("hue", {{1, Color(0, 0, 0)}}, 0.5f);
  CHECK(first[0].color == Color(0, 0, 0));

  Frame second = smoother.smooth("hue", {{1, Color(255, 255, 255)}}, 0.5f);
  // mix(0, 1, 1 - 0.5) == 0.5 -> ~127/128 depending on rounding.
  CHECK(second[0].color.m_r >= 127);
  CHECK(second[0].color.m_r <= 128);
}


TEST_CASE("Smoother keeps separate outputs' same-numbered zones independent", "[Smoother]")
{
  Smoother smoother;

  smoother.smooth("hue", {{1, Color(255, 0, 0)}}, 0.5f);
  Frame dmxFirst = smoother.smooth("dmx", {{1, Color(0, 255, 0)}}, 0.5f);

  // dmx's zone 1 has never been seen before -- must not inherit hue's state.
  CHECK(dmxFirst[0].color == Color(0, 255, 0));
}
