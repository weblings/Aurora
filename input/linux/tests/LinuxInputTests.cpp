#include <catch2/catch_test_macros.hpp>

#include <algorithm>

#include <Aurora/Input/Linux/DummyGrabber.hpp>
#include <Aurora/Input/Linux/SessionDispatch.hpp>
#include <Aurora/Input/Linux/X11Damage.hpp>

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


// Pure half of X11Grabber's damage skip (Aurora-1pwk): the drain loop
// needs a live X server, but the "does this damage touch my monitor?"
// question is plain rect math.


TEST_CASE("damageRectIntersectsMonitor hits overlap and containment", "[X11Damage]")
{
  // Partial overlap, containment both ways, identical rects.
  CHECK(damageRectIntersectsMonitor(100, 100, 50, 50, 0, 0, 3840, 2160));
  CHECK(damageRectIntersectsMonitor(0, 0, 3840, 2160, 100, 100, 50, 50));
  CHECK(damageRectIntersectsMonitor(0, 0, 3840, 2160, 0, 0, 3840, 2160));
  // Single-pixel overlap at the monitor's bottom-right corner.
  CHECK(damageRectIntersectsMonitor(3839, 2159, 10, 10, 0, 0, 3840, 2160));
}


TEST_CASE("damageRectIntersectsMonitor misses disjoint rects", "[X11Damage]")
{
  CHECK_FALSE(damageRectIntersectsMonitor(0, 0, 100, 100, 200, 0, 3840, 2160));
  CHECK_FALSE(damageRectIntersectsMonitor(0, 3000, 100, 100, 0, 0, 3840, 2160));
  // Second monitor's damage doesn't touch the first (side-by-side 4K).
  CHECK_FALSE(damageRectIntersectsMonitor(3900, 100, 50, 50, 0, 0, 3840, 2160));
  CHECK(damageRectIntersectsMonitor(3900, 100, 50, 50, 3840, 0, 3840, 2160));
}


TEST_CASE("damageRectIntersectsMonitor treats touching edges as no area", "[X11Damage]")
{
  CHECK_FALSE(damageRectIntersectsMonitor(3840, 0, 50, 50, 0, 0, 3840, 2160));
  CHECK_FALSE(damageRectIntersectsMonitor(0, 2160, 50, 50, 0, 0, 3840, 2160));
}


TEST_CASE("damageRectIntersectsMonitor rejects empty rects", "[X11Damage]")
{
  CHECK_FALSE(damageRectIntersectsMonitor(100, 100, 0, 50, 0, 0, 3840, 2160));
  CHECK_FALSE(damageRectIntersectsMonitor(100, 100, 50, -1, 0, 0, 3840, 2160));
  CHECK_FALSE(damageRectIntersectsMonitor(100, 100, 50, 50, 0, 0, 0, 2160));
}


TEST_CASE("shouldGrabFrame grabs first, caps busy screens, refreshes stale quiet ones", "[X11Damage]")
{
  // No frame yet: always grab, even with no damage (first tick skips the
  // poll, so damaged=false must not veto it).
  CHECK(shouldGrabFrame(false, false, 1000, 0, 50, 1000));
  CHECK(shouldGrabFrame(false, true, 1000, 0, 50, 1000));
  // Busy screen: grab once the interval elapsed (boundary inclusive)...
  CHECK(shouldGrabFrame(true, true, 1050, 1000, 50, 1000));
  CHECK(shouldGrabFrame(true, true, 1051, 1000, 50, 1000));
  // ...and reuse inside it.
  CHECK_FALSE(shouldGrabFrame(true, true, 1049, 1000, 50, 1000));
  CHECK_FALSE(shouldGrabFrame(true, true, 1000, 1000, 50, 1000));
  // Quiet screen: reuse until maxStaleMs, then grab anyway (drivers that
  // under-report damage still refresh).
  CHECK_FALSE(shouldGrabFrame(true, false, 1999, 1000, 50, 1000));
  CHECK(shouldGrabFrame(true, false, 2000, 1000, 50, 1000));
}


TEST_CASE("X11GrabGate keeps damage from a capped tick pending until a grab", "[X11Damage]")
{
  // Aurora-es51: damage drained on a tick the cap blocks used to be
  // dropped, so a static screen re-served the pre-change frame forever.
  X11GrabGate gate(50, 1000);
  REQUIRE(gate.shouldGrab(true, 1000));
  gate.markGrabbed(1000);

  // The last change of a burst lands inside the cap window: blocked...
  CHECK_FALSE(gate.shouldGrab(true, 1020));
  // ...and later ticks carry no new damage, but it is still pending.
  CHECK_FALSE(gate.shouldGrab(false, 1040));
  CHECK(gate.shouldGrab(false, 1050));
  gate.markGrabbed(1050);

  // Consumed: quiet ticks reuse again until the staleness refresh.
  CHECK_FALSE(gate.shouldGrab(false, 1100));
  CHECK_FALSE(gate.shouldGrab(false, 2049));
  CHECK(gate.shouldGrab(false, 2050));
}


TEST_CASE("X11GrabGate reset forces the next grab and clears the latch", "[X11Damage]")
{
  X11GrabGate gate(50, 1000);
  CHECK_FALSE(gate.hasFrame());
  REQUIRE(gate.shouldGrab(false, 1000));
  gate.markGrabbed(1000);
  CHECK(gate.hasFrame());
  CHECK_FALSE(gate.shouldGrab(true, 1010));

  gate.reset();
  CHECK_FALSE(gate.hasFrame());
  CHECK(gate.shouldGrab(false, 1011));
  gate.markGrabbed(1011);
  // The pre-reset damage didn't survive into the new monitor's cache.
  CHECK_FALSE(gate.shouldGrab(false, 1100));
}
