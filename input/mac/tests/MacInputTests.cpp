#include <chrono>
#include <iostream>
#include <thread>

#include <catch2/catch_test_macros.hpp>

#include <Aurora/Input/Mac/DummyGrabber.hpp>
#include <Aurora/Input/Mac/ScreenCaptureKitGrabber.hpp>

using namespace Aurora::Input;
using namespace Aurora::Input::Mac;
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


TEST_CASE("DummyGrabber reports a fixed refresh rate", "[DummyGrabber]")
{
  DummyGrabber grabber;
  CHECK(grabber.displayRefreshRate() == 60);
}


// Real capture, needs Screen Recording permission and (for the switch itself
// to mean anything) a second attached display -- same "not unit-testable"
// category as X11Grabber/WindowsGrabber. Tagged [.] (Catch2's "hidden"
// convention) so it's excluded from normal `ctest` runs; invoke explicitly
// with `AuroraInputMacTests [manual]` on a machine with a second monitor
// attached to actually verify Aurora-8mk.6's acceptance criteria.
TEST_CASE("ScreenCaptureKitGrabber follows the newly selected monitor", "[.][manual][ScreenCaptureKitGrabber]")
{
  ScreenCaptureKitGrabber grabber;
  grabber.init();

  auto monitors = grabber.monitors();
  for(const auto& monitor : monitors){
    std::cerr << "  found monitor: " << monitor->name << " " << monitor->width
               << "x" << monitor->height << " primary=" << monitor->isPrimary << "\n";
  }

  if(monitors.size() < 2){
    std::cerr << "Only one display attached -- attach a second display to "
                  "exercise the actual switch (Aurora-8mk.6 acceptance "
                  "criteria); skipping.\n";
    return;
  }

  unsigned otherMonitorId = 0;
  for(unsigned i = 0; i < monitors.size(); ++i){
    if(!monitors[i]->isPrimary){
      otherMonitorId = i;
      break;
    }
  }

  grabber.selectMonitor(otherMonitorId);

  // The rebuild is a real async round trip (SCShareableContent +
  // SCStream startup) triggered lazily by the next grab, and the first
  // sample buffer can lag slightly behind a successful start -- retry
  // briefly rather than fail on the first empty frame.
  ImageData image;
  for(int attempt = 0; attempt < 20 && !image.hasData(); ++attempt){
    grabber.grabFrameSubsample(image);
    if(!image.hasData()){
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  }

  REQUIRE(image.hasData());
  CHECK(image.width() == grabber.displayResolution().x);
  CHECK(image.height() == grabber.displayResolution().y);
  std::cerr << "Switched to " << monitors[otherMonitorId]->name << ", now capturing "
            << grabber.displayResolution().x << "x" << grabber.displayResolution().y << "\n";
}
