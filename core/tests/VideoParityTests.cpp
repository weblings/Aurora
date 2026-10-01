#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <functional>

#include <Aurora/Runtime/Orchestrator.hpp>

#include "GoldenFrames.hpp"

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Runtime;
using namespace Aurora::Tests::Golden;

// Golden parity scenarios for the video path (Orchestrator: grab -> rescale
// -> dropAlpha -> per-zone crop + mean -> Smoother -> send). Inputs are
// generated per tick, so there are no binary fixtures; see GoldenFrames.hpp.
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
    Recording recording;
    int tick = 0;

    std::vector<std::unique_ptr<RecordingOutput>> outputs;
    std::vector<Aurora::Output::IOutput*> outputPtrs;
    for(const auto& spec : outputSpecs){
      std::vector<uint8_t> ids;
      for(const auto& zone : spec.zoneMap){
        ids.push_back(zone.zoneId);
      }
      ZoneMapStore(dir.path).save(spec.name, spec.zoneMap);
      outputs.push_back(std::make_unique<RecordingOutput>(spec.name, ids, recording, tick));
      outputPtrs.push_back(outputs.back().get());
    }

    Orchestrator orchestrator(input, outputPtrs, std::move(config), ZoneMapStore(dir.path));
    orchestrator.init();

    for(tick = 0; tick < ticks; ++tick){
      orchestrator.update();
    }
    return recording;
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
  SequenceVideoInput input({16, 8}, [](int, ImageData& image){
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

  auto recording = runScenario("static", input, config, {{"hue", quadrants()}}, 5);
  check("video_static_quadrants", "Flat RGB quadrants, smoothing 0, 5 ticks.", recording);
}


TEST_CASE("Parity: video step change eased by the Smoother", "[Parity][Video]")
{
  // Black for 5 ticks, then white: pins Smoother's per-tick easing curve
  // (mix(prev, cur, 1 - smoothing)) and its first-tick no-history rule.
  SequenceVideoInput input({8, 8}, [](int tick, ImageData& image){
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
  auto recording = runScenario("step", input, config, {{"hue", zones}}, 40);
  check("video_step_smoothed", "Black 5 ticks then white, smoothing 0.8, 40 ticks; zone gamma 0.5 carried through.", recording);
}


TEST_CASE("Parity: video moving gradient, rescaled, two outputs", "[Parity][Video]")
{
  // BGRA source (exercises dropAlpha), 64x32 downscaled to 16 wide with Area
  // (integer factor -- exact across OpenCV builds, unlike Cubic), a
  // gradient that shifts every tick, smoothing 0.5. Two outputs share zone
  // ids to pin Smoother's per-output keying; output "b" has an inactive
  // zone (omitted from its Frame) and an overlapping one.
  SequenceVideoInput input({64, 32}, [](int tick, ImageData& image){
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

  auto recording = runScenario("gradient", input, config, {{"a", quadrants()}, {"b", outputB}}, 30);
  check("video_gradient_two_outputs", "BGRA 64x32 shifting gradient, Area to 16 wide, smoothing 0.5, outputs a (quadrants) and b (inactive + overlapping zones), 30 ticks.", recording);
}


TEST_CASE("Parity: video letterboxed content", "[Parity][Video]")
{
  // Black bars top and bottom around a slowly cycling color: today's mean
  // reducer lets the bars darken edge zones -- pinned so a future
  // letterbox-aware reducer is a visible, deliberate change.
  SequenceVideoInput input({32, 18}, [](int tick, ImageData& image){
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
  auto recording = runScenario("letterbox", input, config, {{"hue", zones}}, 30);
  check("video_letterbox", "32x18 BGR with black bars (rows 0-3, 14-17), cycling content color, three horizontal bands, smoothing 0.3, 30 ticks.", recording);
}
