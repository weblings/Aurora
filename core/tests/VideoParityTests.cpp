#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <functional>

#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>
#include <Aurora/Runtime/Orchestrator.hpp>
#include <Aurora/Runtime/ZoneReconciler.hpp>

#include "GoldenFrames.hpp"
#include "GraphParityHost.hpp"

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Runtime;
using namespace Aurora::Tests::Golden;

// Golden parity scenarios for the video path (Orchestrator: grab -> rescale
// -> dropAlpha -> per-zone crop + mean -> Smoother -> send). Inputs are
// generated per tick, so there are no binary fixtures; see GoldenFrames.hpp.
// Every scenario runs twice against the same fixture: through Orchestrator
// and through the built-in Video graph (Aurora-ra4o.7).
namespace
{
  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-video-parity-" + name))
    {
      std::filesystem::remove_all(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  // Plays a generator one frame per grab, indexed by call count, never by
  // wall clock (unlike DummyGrabber) -- that's what makes a run repeatable.
  class SequenceVideoInput : public IVideoInput
  {
  public:
    using Generator = std::function<void(int tick, ImageData&)>;

    SequenceVideoInput(Resolution resolution, Generator generator):
    m_resolution(resolution),
    m_generator(std::move(generator))
    {}

    const std::string& name() const override
    {
      static const std::string s_name = "SequenceVideoInput";
      return s_name;
    }

    Resolution displayResolution() const override { return m_resolution; }
    RefreshRate displayRefreshRate() const override { return 60; }

    void grabFrameSubsample(ImageData& imageData) override
    {
      m_generator(m_tick++, imageData);
    }

  private:
    Resolution m_resolution;
    Generator m_generator;
    int m_tick{0};
  };


  struct OutputSpec
  {
    std::string name;
    ZoneMap zoneMap;
  };


  enum class Path
  {
    Orchestrator,
    Graph
  };


  // Zone maps and recording outputs for one run, saved/reconciled the way
  // Orchestrator::init does so both paths start from identical maps.
  struct Rig
  {
    Recording recording;
    int tick{0};
    std::vector<std::unique_ptr<RecordingOutput>> outputs;
    std::vector<Aurora::Output::IOutput*> outputPtrs;
    std::vector<std::string> names;
  };


  void buildRig(Rig& rig, const std::vector<OutputSpec>& outputSpecs)
  {
    for(const auto& spec : outputSpecs){
      std::vector<uint8_t> ids;
      for(const auto& zone : spec.zoneMap){
        ids.push_back(zone.zoneId);
      }
      rig.outputs.push_back(std::make_unique<RecordingOutput>(spec.name, ids, rig.recording, rig.tick));
      rig.outputPtrs.push_back(rig.outputs.back().get());
      rig.names.push_back(spec.name);
    }
  }


  // Explicit refreshRate/subsampleWidth so init() never derives them from
  // the fake display -- a derivation change shouldn't read as a parity break.
  Recording runScenario(
    const std::string& tag,
    SequenceVideoInput& input,
    Config config,
    const std::vector<OutputSpec>& outputSpecs,
    int ticks
  )
  {
    ScopedTempDir dir(tag);
    Rig rig;
    buildRig(rig, outputSpecs);
    for(const auto& spec : outputSpecs){
      ZoneMapStore(dir.path).save(spec.name, spec.zoneMap);
    }

    Orchestrator orchestrator(input, rig.outputPtrs, std::move(config), ZoneMapStore(dir.path));
    orchestrator.init();

    for(rig.tick = 0; rig.tick < ticks; ++rig.tick){
      orchestrator.update(1.0f / 60.0f);
    }
    return rig.recording;
  }


  Recording runGraphScenario(
    SequenceVideoInput& input,
    const Config& config,
    const std::vector<OutputSpec>& outputSpecs,
    int ticks
  )
  {
    Rig rig;
    buildRig(rig, outputSpecs);

    Aurora::Tests::Golden::ParityHost host;
    host.video = &input;
    for(size_t i = 0; i < outputSpecs.size(); ++i){
      host.outputs[outputSpecs[i].name] = rig.outputPtrs[i];
      host.zoneMaps[outputSpecs[i].name] =
        reconcileZoneMap(outputSpecs[i].zoneMap, rig.outputPtrs[i]->zoneIds());
    }

    Aurora::Runtime::Graph::NodeRegistry registry;
    Aurora::Runtime::Graph::registerVideoNodes(registry);
    Aurora::Runtime::Graph::registerFrameNodes(registry);
    auto loaded = Aurora::Runtime::Graph::loadBuiltInVideoGraph(registry, rig.names, config.data());
    INFO(loaded.error);
    REQUIRE(loaded.ok);

    for(rig.tick = 0; rig.tick < ticks; ++rig.tick){
      loaded.graph.tick(1.0f / 60.0f, &host);
    }
    return rig.recording;
  }


  // Same generator, fresh input per path (inputs count calls). The Graph
  // run is skipped while regenerating so fixtures stay derived from the
  // legacy path.
  void checkBothPaths(
    const std::string& scenario,
    const std::string& description,
    IVideoInput::Resolution resolution,
    const SequenceVideoInput::Generator& generator,
    const Config& config,
    const std::vector<OutputSpec>& outputSpecs,
    int ticks
  )
  {
    {
      INFO("path: Orchestrator");
      SequenceVideoInput input(resolution, generator);
      check(scenario, description, runScenario(scenario, input, config, outputSpecs, ticks));
    }
    if(std::getenv("AURORA_UPDATE_GOLDEN")){
      return;
    }
    {
      INFO("path: built-in Video graph");
      SequenceVideoInput input(resolution, generator);
      check(scenario, description, runGraphScenario(input, config, outputSpecs, ticks));
    }
  }


  ZoneConfig zone(uint8_t id, float u0, float v0, float u1, float v1, bool active = true, float gamma = 0.f)
  {
    ZoneConfig config;
    config.zoneId = id;
    config.uvs = {{u0, v0}, {u1, v1}};
    config.active = active;
    config.gamma = gamma;
    config.everConfigured = true;
    return config;
  }


  ZoneMap quadrants()
  {
    return {
      zone(1, 0.f, 0.f, 0.5f, 0.5f),
      zone(2, 0.5f, 0.f, 1.f, 0.5f),
      zone(3, 0.f, 0.5f, 0.5f, 1.f),
      zone(4, 0.5f, 0.5f, 1.f, 1.f)
    };
  }
}


TEST_CASE("Parity: video static quadrants, no smoothing", "[Parity][Video]")
{
  // Anchor case: four flat colors, nothing time-varying. Nearest, already at
  // subsample width, so rescale is a no-op.
  const IVideoInput::Resolution resolution{16, 8};
  const SequenceVideoInput::Generator generator([](int, ImageData& image){
    image.format = PixelFormat::RGB;
    image.imageMatrix = cv::Mat(8, 16, CV_8UC3, cv::Scalar(0, 0, 0));
    image.imageMatrix(cv::Rect(0, 0, 8, 4)).setTo(cv::Scalar(255, 0, 0));
    image.imageMatrix(cv::Rect(8, 0, 8, 4)).setTo(cv::Scalar(0, 255, 0));
    image.imageMatrix(cv::Rect(0, 4, 8, 4)).setTo(cv::Scalar(0, 0, 255));
    image.imageMatrix(cv::Rect(8, 4, 8, 4)).setTo(cv::Scalar(200, 120, 40));
  });

  Config config;
  config.setRefreshRate(60);
  config.setSubsampleWidth(16);
  config.setInterpolation(Interpolation::Type::Nearest);
  config.setTransitionSmoothing(0.f);

  checkBothPaths("video_static_quadrants", "Flat RGB quadrants, smoothing 0, 5 ticks.", resolution, generator, config, {{"hue", quadrants()}}, 5);
}


TEST_CASE("Parity: video step change eased by the Smoother", "[Parity][Video]")
{
  // Black for 5 ticks, then white: pins Smoother's per-tick easing curve
  // (mix(prev, cur, 1 - smoothing)) and its first-tick no-history rule.
  const IVideoInput::Resolution resolution{8, 8};
  const SequenceVideoInput::Generator generator([](int tick, ImageData& image){
    image.format = PixelFormat::BGR;
    double level = tick < 5 ? 0.0 : 255.0;
    image.imageMatrix = cv::Mat(8, 8, CV_8UC3, cv::Scalar(level, level, level));
  });

  Config config;
  config.setRefreshRate(60);
  config.setSubsampleWidth(8);
  config.setInterpolation(Interpolation::Type::Nearest);
  config.setTransitionSmoothing(0.8f);

  ZoneMap zones = {zone(1, 0.f, 0.f, 1.f, 1.f, true, 0.5f)};
  checkBothPaths("video_step_smoothed", "Black 5 ticks then white, smoothing 0.8, 40 ticks; zone gamma 0.5 carried through.", resolution, generator, config, {{"hue", zones}}, 40);
}


TEST_CASE("Parity: video moving gradient, rescaled, two outputs", "[Parity][Video]")
{
  // BGRA source (exercises dropAlpha), 64x32 downscaled to 16 wide with Area
  // (integer factor -- exact across OpenCV builds, unlike Cubic), a
  // gradient that shifts every tick, smoothing 0.5. Two outputs share zone
  // ids to pin Smoother's per-output keying; output "b" has an inactive
  // zone (omitted from its Frame) and an overlapping one.
  const IVideoInput::Resolution resolution{64, 32};
  const SequenceVideoInput::Generator generator([](int tick, ImageData& image){
    image.format = PixelFormat::BGRA;
    image.imageMatrix = cv::Mat(32, 64, CV_8UC4);
    for(int y = 0; y < 32; ++y){
      for(int x = 0; x < 64; ++x){
        int shifted = (x + tick * 3) % 64;
        image.imageMatrix.at<cv::Vec4b>(y, x) = cv::Vec4b(
          static_cast<uint8_t>(shifted * 4),          // B
          static_cast<uint8_t>(y * 8),                // G
          static_cast<uint8_t>(255 - shifted * 4),    // R
          255
        );
      }
    }
  });

  Config config;
  config.setRefreshRate(60);
  config.setSubsampleWidth(16);
  config.setInterpolation(Interpolation::Type::Area);
  config.setTransitionSmoothing(0.5f);

  ZoneMap outputB = {
    zone(1, 0.f, 0.f, 0.25f, 1.f),
    zone(2, 0.2f, 0.25f, 0.6f, 0.75f, true, 1.f),
    zone(3, 0.5f, 0.f, 1.f, 1.f, false)
  };

  checkBothPaths("video_gradient_two_outputs", "BGRA 64x32 shifting gradient, Area to 16 wide, smoothing 0.5, outputs a (quadrants) and b (inactive + overlapping zones), 30 ticks.", resolution, generator, config, {{"a", quadrants()}, {"b", outputB}}, 30);
}


TEST_CASE("Parity: video letterboxed content", "[Parity][Video]")
{
  // Black bars top and bottom around a slowly cycling color: today's mean
  // reducer lets the bars darken edge zones -- pinned so a future
  // letterbox-aware reducer is a visible, deliberate change.
  const IVideoInput::Resolution resolution{32, 18};
  const SequenceVideoInput::Generator generator([](int tick, ImageData& image){
    image.format = PixelFormat::BGR;
    image.imageMatrix = cv::Mat(18, 32, CV_8UC3, cv::Scalar(0, 0, 0));
    double phase = tick * 0.2;
    cv::Scalar content(
      127.5 + 127.5 * std::cos(phase),
      127.5 + 127.5 * std::cos(phase + 2.0),
      127.5 + 127.5 * std::cos(phase + 4.0)
    );
    image.imageMatrix(cv::Rect(0, 4, 32, 10)).setTo(content);
  });

  Config config;
  config.setRefreshRate(60);
  config.setSubsampleWidth(32);
  config.setInterpolation(Interpolation::Type::Nearest);
  config.setTransitionSmoothing(0.3f);

  ZoneMap zones = {
    zone(1, 0.f, 0.f, 1.f, 0.33f),
    zone(2, 0.f, 0.33f, 1.f, 0.66f),
    zone(3, 0.f, 0.66f, 1.f, 1.f)
  };
  checkBothPaths("video_letterbox", "32x18 BGR with black bars (rows 0-3, 14-17), cycling content color, three horizontal bands, smoothing 0.3, 30 ticks.", resolution, generator, config, {{"hue", zones}}, 30);
}
