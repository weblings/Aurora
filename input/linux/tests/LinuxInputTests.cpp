#include <catch2/catch_test_macros.hpp>

#include <algorithm>

#include <Aurora/Input/Linux/DummyGrabber.hpp>
#include <Aurora/Input/Linux/SessionDispatch.hpp>

using namespace Aurora::Input;
using namespace Aurora::Input::Linux;
using namespace Aurora::Contracts;


namespace
{
  // Test-only IVideoInput with a controllable resolution -- DummyGrabber's fixed
  // 16x9 is coprime (only shares divisor 1), too weak to exercise the
  // _divisors() completeness fix.
  class TestInput : public IVideoInput
  {
  public:
    explicit TestInput(Resolution resolution) : m_resolution(resolution) {}

    const std::string& name() const override
    {
      static const std::string s_name = "TestInput";
      return s_name;
    }

    Resolution displayResolution() const override { return m_resolution; }
    RefreshRate displayRefreshRate() const override { return 60; }
    void grabFrameSubsample(ImageData&) override {}

  private:
    Resolution m_resolution;
  };


  bool contains(const IVideoInput::Resolutions& resolutions, IVideoInput::Resolution target)
  {
    return std::any_of(resolutions.begin(), resolutions.end(), [&](const auto& r){
      return r.x == target.x && r.y == target.y;
    });
  }
}


TEST_CASE("subsampleResolutionCandidates includes divisors the pre-fix off-by-one excluded", "[IVideoInput][regression]")
{
  // Finding (LinuxCaptureAnalysis.md): _divisors() used to exclude number/2
  // itself. For a 12x6 input, that silently dropped divisor 6, which in turn
  // dropped the (4,2) and (2,1) candidates below.
  TestInput input({12, 6});
  auto candidates = input.subsampleResolutionCandidates();

  CHECK(contains(candidates, {12, 6}));
  CHECK(contains(candidates, {6, 3}));
  CHECK(contains(candidates, {4, 2}));
  CHECK(contains(candidates, {2, 1}));
  CHECK(candidates.size() == 4);
}


TEST_CASE("DummyGrabber produces a correctly-sized, tagged frame", "[DummyGrabber]")
{
  DummyGrabber grabber;
  CHECK(grabber.name() == "DummyGrabber");

  ImageData image;
  grabber.grabFrameSubsample(image);

  REQUIRE(image.hasData());
  CHECK(image.width() == grabber.displayResolution().x);
  CHECK(image.height() == grabber.displayResolution().y);
  CHECK(image.format == PixelFormat::BGR);
}


TEST_CASE("selectBackend prioritizes Gamescope's marker over XDG_SESSION_TYPE", "[SessionDispatch]")
{
  // Gamescope sets XDG_SESSION_TYPE=x11 for legacy compatibility -- its own
  // marker must win, or capture silently targets the wrong compositor.
  CHECK(selectBackend("x11", /*gamescope*/ true, /*pipewire*/ true, /*x11*/ true) == Backend::GamescopePipewire);
}


TEST_CASE("selectBackend falls through wayland, x11, then unavailable", "[SessionDispatch]")
{
  CHECK(selectBackend("wayland", false, true, true) == Backend::WaylandPipewire);
  CHECK(selectBackend("x11", false, true, true) == Backend::X11);
  CHECK(selectBackend("tty", false, true, true) == Backend::Unavailable);
  CHECK(selectBackend(std::nullopt, false, true, true) == Backend::Unavailable);
}


TEST_CASE("selectBackend respects which backends are actually compiled in", "[SessionDispatch]")
{
  CHECK(selectBackend("wayland", false, /*pipewire*/ false, true) == Backend::Unavailable);
  CHECK(selectBackend("x11", false, true, /*x11*/ false) == Backend::Unavailable);
}
