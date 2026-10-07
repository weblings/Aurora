#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <algorithm>
#include <fstream>
#include <limits>
#include <stdexcept>
#include <thread>
#include <vector>

#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/ConfigApply.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/ControlDescriptorTables.hpp>
#include <Aurora/Runtime/FrameCompositor.hpp>
#include <Aurora/Runtime/MonitorSelector.hpp>
#include <Aurora/Runtime/PendingRunRequest.hpp>
#include <Aurora/Runtime/Smoother.hpp>
#include <Aurora/Runtime/TickClock.hpp>
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

  config.setRefreshRate(15729223); // persisted PipeWire-numerator garbage, pre-fix
  CHECK(config.refreshRate() == Config::kMaxRefreshRate);

  config.setTransitionSmoothing(5.f);
  CHECK(config.transitionSmoothing() == Catch::Approx(0.97f));

  config.setTransitionSmoothing(-1.f);
  CHECK(config.transitionSmoothing() == Catch::Approx(0.f));
}


TEST_CASE("setAudioCentroidRangeHz clamps away from zero (Aurora-9ca)", "[Config]")
{
  Config config;

  // The REST repro: PUT /api/config {"audioCentroidRangeHz": 0} must
  // never reach updateDrift's divide as zero.
  config.setAudioCentroidRangeHz(0.f);
  CHECK(config.audioCentroidRangeHz() == Catch::Approx(100.f));

  config.setAudioCentroidRangeHz(-50.f);
  CHECK(config.audioCentroidRangeHz() == Catch::Approx(100.f));

  config.setAudioCentroidRangeHz(50000.f);
  CHECK(config.audioCentroidRangeHz() == Catch::Approx(8000.f));

  config.setAudioCentroidRangeHz(std::numeric_limits<float>::quiet_NaN());
  CHECK(config.audioCentroidRangeHz() == Catch::Approx(2250.f));
}


namespace
{
  // Every numeric setting: descriptor key -> its Config setter/getter. The
  // test-side list is checked against the descriptor tables below, so a
  // slider added without wiring fails here rather than going unclamped.
  struct NumericSetting
  {
    const char* key;
    void (Config::*set)(float);
    float (Config::*get)() const;
  };

  const NumericSetting NumericSettings[] = {
    {"video.transitionSmoothing", &Config::setTransitionSmoothing, &Config::transitionSmoothing},
    {"audio.fixedAnchorHue", &Config::setAudioFixedAnchorHue, &Config::audioFixedAnchorHue},
    {"audio.bounceSmoothTime", &Config::setAudioBounceSmoothTime, &Config::audioBounceSmoothTime},
    {"audio.dynamismFloor", &Config::setAudioDynamismFloor, &Config::audioDynamismFloor},
    {"audio.centroidStrength", &Config::setAudioCentroidStrength, &Config::audioCentroidStrength},
    {"audio.driftBaseRateDegPerSec", &Config::setAudioDriftBaseRateDegPerSec, &Config::audioDriftBaseRateDegPerSec},
    {"audio.vibrancySaturation", &Config::setAudioVibrancySaturation, &Config::audioVibrancySaturation},
    {"audio.vibrancyValue", &Config::setAudioVibrancyValue, &Config::audioVibrancyValue},
    {"audio.referenceRms", &Config::setAudioReferenceRms, &Config::audioReferenceRms},
    {"audio.brightnessFloor", &Config::setAudioBrightnessFloor, &Config::audioBrightnessFloor},
    {"audio.centroidRangeHz", &Config::setAudioCentroidRangeHz, &Config::audioCentroidRangeHz},
    {"audio.brightnessSmoothTime", &Config::setAudioBrightnessSmoothTime, &Config::audioBrightnessSmoothTime},
  };
}


TEST_CASE("Every slider descriptor carries a ParamSchema and a wired setter (Aurora-ta5)", "[Config][Descriptors]")
{
  auto all = videoControlDescriptors();
  auto audio = audioControlDescriptors();
  all.insert(all.end(), audio.begin(), audio.end());

  size_t sliders = 0;
  for(const auto& descriptor : all){
    if(descriptor.kind != "slider"){
      CHECK_FALSE(descriptor.param);
      continue;
    }
    ++sliders;
    INFO(descriptor.key);
    REQUIRE(descriptor.param);
    CHECK(descriptor.param->min < descriptor.param->max);
    CHECK_FALSE(descriptor.param->label.empty());
    bool wired = std::any_of(std::begin(NumericSettings), std::end(NumericSettings),
      [&](const NumericSetting& s){ return descriptor.key == s.key; });
    CHECK(wired);
  }
  CHECK(sliders == std::size(NumericSettings));
}


TEST_CASE("Numeric setters clamp to their schema; non-finite resets to default (Aurora-ta5)", "[Config]")
{
  const float nan = std::numeric_limits<float>::quiet_NaN();
  const float inf = std::numeric_limits<float>::infinity();

  for(const auto& setting : NumericSettings){
    INFO(setting.key);
    const auto& param = paramSchema(setting.key);
    Config config;

    // Default comes from ConfigData, and a fresh Config holds it.
    CHECK((config.*setting.get)() == Catch::Approx(param.defaultValue));

    (config.*setting.set)(param.max + 1000.f);
    CHECK((config.*setting.get)() == Catch::Approx(param.max));

    (config.*setting.set)(nan);
    CHECK((config.*setting.get)() == Catch::Approx(param.defaultValue));

    (config.*setting.set)(inf);
    CHECK((config.*setting.get)() == Catch::Approx(param.defaultValue));

    (config.*setting.set)(param.min - 1000.f);
    CHECK((config.*setting.get)() == Catch::Approx(param.allowsUnset ? -1.f : param.min));

    const float mid = (param.min + param.max) / 2.f;
    (config.*setting.set)(mid);
    CHECK((config.*setting.get)() == Catch::Approx(mid));
  }
}


TEST_CASE("Config built from raw ConfigData sanitizes every numeric field (Aurora-ta5)", "[Config]")
{
  // The ConfigStore::fromJson path: fields written directly, no setters.
  ConfigData raw;
  raw.transitionSmoothing = 5.f;
  raw.audioBounceSmoothTime = 0.f;
  raw.audioReferenceRms = -3.f;
  raw.audioCentroidRangeHz = 0.f;
  raw.audioVibrancyValue = std::numeric_limits<float>::quiet_NaN();
  raw.audioFixedAnchorHue = -1.f; // unset sentinel survives

  Config config(raw);
  CHECK(config.transitionSmoothing() == Catch::Approx(0.97f));
  CHECK(config.audioBounceSmoothTime() == Catch::Approx(0.05f));
  CHECK(config.audioReferenceRms() == Catch::Approx(0.05f));
  CHECK(config.audioCentroidRangeHz() == Catch::Approx(100.f));
  CHECK(config.audioVibrancyValue() == Catch::Approx(ConfigData{}.audioVibrancyValue));
  CHECK(config.audioFixedAnchorHue() == Catch::Approx(-1.f));
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


TEST_CASE("ConfigStore::update saves only when mutate returns true (Aurora-d6i7)", "[ConfigStore]")
{
  ScopedTempDir dir("update-semantics");
  ConfigStore store(dir.path);

  Config saved = store.update([](Config& config){
    config.setRefreshRate(45);
    return true;
  });
  CHECK(saved.refreshRate() == 45);
  CHECK(store.load().refreshRate() == 45);

  // Declined: the in-memory change is returned but never reaches disk.
  Config declined = store.update([](Config& config){
    config.setRefreshRate(90);
    return false;
  });
  CHECK(declined.refreshRate() == 90);
  CHECK(store.load().refreshRate() == 45);

  // Missing file: mutate sees defaults, same as load().
  ScopedTempDir fresh("update-missing-file");
  ConfigStore freshStore(fresh.path);
  freshStore.update([](Config& config){
    CHECK(config.refreshRate() == 0);
    config.setSubsampleWidth(64);
    return true;
  });
  CHECK(freshStore.load().subsampleWidth() == 64);
}


TEST_CASE("ConfigStore::update saves nothing when mutate throws (Aurora-d6i7)", "[ConfigStore]")
{
  ScopedTempDir dir("update-throws");
  ConfigStore store(dir.path);
  store.update([](Config& config){ config.setRefreshRate(45); return true; });

  CHECK_THROWS_AS(store.update([](Config& config){
    config.setRefreshRate(90);
    throw std::runtime_error("bad patch");
    return true;
  }), std::runtime_error);

  CHECK(store.load().refreshRate() == 45);

  // The lock was released on the way out, or this would deadlock.
  CHECK(store.update([](Config&){ return false; }).refreshRate() == 45);
}


TEST_CASE("Concurrent ConfigStore::update calls lose no write (Aurora-d6i7)", "[ConfigStore]")
{
  ScopedTempDir dir("update-concurrent");
  ConfigStore store(dir.path);

  constexpr int kThreads = 8;
  constexpr int kPerThread = 25;

  std::vector<std::thread> threads;
  for(int t = 0; t < kThreads; ++t){
    threads.emplace_back([&store, t]{
      for(int i = 0; i < kPerThread; ++i){
        store.update([t, i](Config& config){
          auto names = config.activeOutputNames();
          names.push_back("out-" + std::to_string(t) + "-" + std::to_string(i));
          config.setActiveOutputNames(std::move(names));
          return true;
        });
      }
    });
  }
  for(auto& thread : threads){ thread.join(); }

  CHECK(store.load().activeOutputNames().size() == static_cast<size_t>(kThreads * kPerThread));
}


TEST_CASE("changedConfigKeys names exactly the fields whose saved value differs (Aurora-c0g)", "[ConfigStore]")
{
  Config a;
  Config b;
  CHECK(changedConfigKeys(a, b).empty());

  b.setTransitionSmoothing(0.5f);
  b.setActiveOutputNames({"hue"});
  b.setNuxCompleted(true);
  auto changed = changedConfigKeys(a, b);
  std::sort(changed.begin(), changed.end()); // order is the JSON library's, not a contract
  CHECK(changed == std::vector<std::string>{"activeOutputNames", "nuxCompleted", "transitionSmoothing"});
}


TEST_CASE("Every persisted Config field is classified for live apply (Aurora-c0g)", "[ConfigApply]")
{
  // A new field added to ConfigStore's JSON without a ConfigApply row would
  // silently reload on every change; this makes the omission a test failure.
  for(const auto& key : configKeys()){
    INFO("unclassified Config field: " << key);
    CHECK(classifyConfigField(key) != nullptr);
  }

  CHECK(classifyConfigField("noSuchField") == nullptr);
}


TEST_CASE("planConfigChange sorts a change into None, Hot or Reload (Aurora-c0g)", "[ConfigApply]")
{
  Config applied;
  applied.setRefreshRate(30);
  applied.setSubsampleWidth(64);

  auto plan = [&](auto edit, bool audioMode = false){
    Config next = applied;
    edit(next);
    return planConfigChange(applied, next, audioMode);
  };

  CHECK(plan([](Config&){}) == ChangeAction::None);

  // Video-side hot fields.
  CHECK(plan([](Config& c){ c.setTransitionSmoothing(0.5f); }) == ChangeAction::Hot);
  CHECK(plan([](Config& c){ c.setInterpolation(Interpolation::Type::Nearest); }) == ChangeAction::Hot);
  CHECK(plan([](Config& c){ c.setRefreshRate(60); }) == ChangeAction::Hot);
  CHECK(plan([](Config& c){ c.setSubsampleWidth(96); }) == ChangeAction::Hot);

  // Audio-side hot fields, in audio mode.
  CHECK(plan([](Config& c){ c.setAudioVibrancyValue(0.5f); }, true) == ChangeAction::Hot);
  CHECK(plan([](Config& c){ c.setAudioFixedAnchorHue(120.f); }, true) == ChangeAction::Hot);

  // A hot field the running mode never reads: neither applies nor reloads.
  CHECK(plan([](Config& c){ c.setAudioVibrancyValue(0.5f); }, false) == ChangeAction::None);
  CHECK(plan([](Config& c){ c.setTransitionSmoothing(0.5f); }, true) == ChangeAction::None);
  CHECK(plan([](Config& c){ c.setRefreshRate(60); }, true) == ChangeAction::None);

  // Fields nothing in the pipeline reads.
  CHECK(plan([](Config& c){ c.setNuxCompleted(true); }) == ChangeAction::None);

  // Structural fields.
  CHECK(plan([](Config& c){ c.setActiveInputName("x11"); }) == ChangeAction::Reload);
  CHECK(plan([](Config& c){ c.setActiveOutputNames({"hue"}); }) == ChangeAction::Reload);
  CHECK(plan([](Config& c){ c.setActiveMonitorName("DP-1"); }) == ChangeAction::Reload);
  CHECK(plan([](Config& c){ c.setActiveAudioInputName("pw"); }, true) == ChangeAction::Reload);
  CHECK(plan([](Config& c){ c.setAudioTargetSinkName("sink"); }, true) == ChangeAction::Reload);

  // One structural field among hot ones reloads the lot.
  CHECK(plan([](Config& c){
    c.setTransitionSmoothing(0.5f);
    c.setActiveOutputNames({"hue"});
  }) == ChangeAction::Reload);
}


TEST_CASE("planConfigChange reloads when a derived-at-zero field moves to or from 0 (Aurora-c0g)", "[ConfigApply]")
{
  Config derived;
  derived.setRefreshRate(30);
  derived.setSubsampleWidth(64);

  // setRefreshRate clamps to >= 1, so 0 reaches a Config only from a loaded
  // (hand-edited or first-run) file: build it the way ConfigStore does.
  ConfigData unsetData = derived.data();
  unsetData.refreshRate = 0;
  Config unset(unsetData);
  REQUIRE(unset.refreshRate() == 0);

  CHECK(planConfigChange(derived, unset, false) == ChangeAction::Reload);
  CHECK(planConfigChange(unset, derived, false) == ChangeAction::Reload);

  Config unsetWidth = derived;
  unsetWidth.setSubsampleWidth(0);
  CHECK(planConfigChange(derived, unsetWidth, false) == ChangeAction::Reload);

  // In audio mode neither field is read, so the same edit is a no-op.
  CHECK(planConfigChange(derived, unset, true) == ChangeAction::None);
}


TEST_CASE("ConfigStore clamps a persisted garbage refreshRate on load", "[ConfigStore]")
{
  ScopedTempDir dir("garbage-refresh");
  std::filesystem::create_directories(dir.path); // save() does this for free; raw write does not
  {
    std::ofstream file(dir.path / "config.json");
    file << "{\"refreshRate\": 15729223}";
  }

  ConfigStore store(dir.path);
  CHECK(store.load().refreshRate() == Config::kMaxRefreshRate);
}


TEST_CASE("ConfigStore clamps persisted out-of-range tuning on load (Aurora-5y0)", "[ConfigStore]")
{
  // fromJson writes ConfigData directly -- load must re-apply the setter
  // clamps or a hand-edited config.json skips them (Aurora-9ca's gap).
  ScopedTempDir dir("garbage-tuning");
  std::filesystem::create_directories(dir.path);
  {
    std::ofstream file(dir.path / "config.json");
    file << "{\"audioCentroidRangeHz\": 0, \"transitionSmoothing\": 5}";
  }

  ConfigStore store(dir.path);
  Config config = store.load();
  CHECK(config.audioCentroidRangeHz() == Catch::Approx(100.f));
  CHECK(config.transitionSmoothing() == Catch::Approx(0.97f));
}


TEST_CASE("tickIntervalSeconds uses the given rate, else the 60Hz default (Aurora-skv)", "[TickClock]")
{
  CHECK(tickIntervalSeconds(144) == Catch::Approx(1.0 / 144.0));
  CHECK(tickIntervalSeconds(0) == Catch::Approx(1.0 / 60.0)); // audio mode, nothing running
  CHECK(tickIntervalSeconds() == Catch::Approx(1.0 / DefaultTickRateHz));
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


TEST_CASE("PendingRunRequest posts the clicked target, last click wins (Aurora-q9l1)", "[Tray]")
{
  PendingRunRequest pending;

  CHECK_FALSE(pending.take().has_value());

  pending.requestPause();
  REQUIRE(pending.take() == std::optional<bool>(false));
  CHECK_FALSE(pending.take().has_value());

  // Run then pause: the pause was clicked last.
  pending.requestRun();
  pending.requestPause();
  REQUIRE(pending.take() == std::optional<bool>(false));

  // Pause then run: the run was clicked last.
  pending.requestPause();
  pending.requestRun();
  REQUIRE(pending.take() == std::optional<bool>(true));

  // The menu offers Resume when paused, Pause when running, so the
  // click-time target is run exactly when paused now.
  pending.requestToggle(/*isPausedNow*/ true);
  REQUIRE(pending.take() == std::optional<bool>(true));
  pending.requestToggle(/*isPausedNow*/ false);
  REQUIRE(pending.take() == std::optional<bool>(false));

  // Two Resume clicks during a slow resume stay a run request: applied
  // through the idempotent setRunning(true) it is a no-op, never a pause.
  pending.requestToggle(/*isPausedNow*/ true);
  pending.requestToggle(/*isPausedNow*/ true);
  REQUIRE(pending.take() == std::optional<bool>(true));
  CHECK_FALSE(pending.take().has_value());
}
