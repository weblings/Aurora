#include <catch2/catch_test_macros.hpp>

#include <iostream>

#include <Aurora/Input/Windows/DummyGrabber.hpp>

#ifdef AURORA_INPUT_WINDOWS_DXGI_AVAILABLE
#include <Aurora/Input/Windows/WindowsGrabber.hpp>
#endif

using namespace Aurora::Input;
using namespace Aurora::Input::Windows;
using namespace Aurora::Contracts;


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


#ifdef AURORA_INPUT_WINDOWS_DXGI_AVAILABLE
// Real capture, not unit-testable (needs a real interactive desktop) --
// same category as X11Grabber/PipewireGrabber. Tagged [.] (Catch2's
// "hidden" convention) so it's excluded from normal `ctest` runs; invoke
// explicitly with `AuroraInputWindowsTests.exe [manual]` to actually verify
// capture on a given machine.
TEST_CASE("WindowsGrabber captures real, non-empty frames", "[.][manual][WindowsGrabber]")
{
  WindowsGrabber grabber;
  grabber.init();

  // A powered-off-but-attached monitor reads back as real, valid, all-black
  // data -- list every enumerated monitor so that's diagnosable, not mistaken for a bug.
  for(const auto& monitor : grabber.monitors()){
    std::cerr << "  found monitor: " << monitor->name << " " << monitor->width
               << "x" << monitor->height << " primary=" << monitor->isPrimary << "\n";
  }

  std::cerr << "Monitor: " << grabber.displayResolution().x << "x"
            << grabber.displayResolution().y << " @ "
            << grabber.displayRefreshRate() << "Hz\n";

  for(int i = 0; i < 5; ++i){
    ImageData image;
    grabber.grabFrameSubsample(image);

    // BGRA (SDR) or RGBA (HDR desktop, converted) -- both valid, see WindowsGrabber.
    REQUIRE(image.hasData());
    CHECK((image.format == PixelFormat::BGRA || image.format == PixelFormat::RGBA));

    auto mean = cv::mean(image.imageMatrix);
    std::cerr << "Frame " << i << ": " << image.width() << "x" << image.height()
               << " mean BGRA = (" << mean[0] << ", " << mean[1] << ", " << mean[2] << ", " << mean[3] << ")\n";
  }
}
#endif
