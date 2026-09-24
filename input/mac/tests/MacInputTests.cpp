#include <catch2/catch_test_macros.hpp>

#include <Aurora/Input/Mac/DummyGrabber.hpp>

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
