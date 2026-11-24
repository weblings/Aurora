#include <catch2/catch_test_macros.hpp>

#include <CoreGraphics/CoreGraphics.h>

#include <Aurora/Input/Mac/DisplayReconfiguration.hpp>

using namespace Aurora::Input::Mac;

TEST_CASE("DisplayFlag constants equal the CoreGraphics values", "[DisplayReconfiguration]")
{
  CHECK(DisplayFlag::BeginConfiguration == kCGDisplayBeginConfigurationFlag);
  CHECK(DisplayFlag::Moved == kCGDisplayMovedFlag);
  CHECK(DisplayFlag::SetMain == kCGDisplaySetMainFlag);
  CHECK(DisplayFlag::SetMode == kCGDisplaySetModeFlag);
  CHECK(DisplayFlag::Add == kCGDisplayAddFlag);
  CHECK(DisplayFlag::Remove == kCGDisplayRemoveFlag);
  CHECK(DisplayFlag::Enabled == kCGDisplayEnabledFlag);
  CHECK(DisplayFlag::Disabled == kCGDisplayDisabledFlag);
  CHECK(DisplayFlag::Mirror == kCGDisplayMirrorFlag);
  CHECK(DisplayFlag::UnMirror == kCGDisplayUnMirrorFlag);
  CHECK(DisplayFlag::DesktopShapeChanged == kCGDisplayDesktopShapeChangedFlag);
}

TEST_CASE("an observed display add and remove are monitor changes", "[DisplayReconfiguration]")
{
  // macOS 27.2.1, virtual display: the new display's final callback, then the removed one's.
  CHECK(displayReconfigurationMayChangeMonitors(0x111a));
  CHECK(displayReconfigurationMayChangeMonitors(0x1220));
}

TEST_CASE("the BeginConfiguration pre-pass and desktop-shape callbacks are not", "[DisplayReconfiguration]")
{
  // Observed: every display gets 0x1 first, and the surviving display gets 0x1000 afterwards.
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(0x1));
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(0x1000));
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(0));
}

TEST_CASE("a pre-pass that also carries a membership bit still waits for the final call", "[DisplayReconfiguration]")
{
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(DisplayFlag::BeginConfiguration | DisplayFlag::Add));
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(DisplayFlag::BeginConfiguration | DisplayFlag::Remove));
}

TEST_CASE("position, mode and primary changes alone do not trigger a re-read", "[DisplayReconfiguration]")
{
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(DisplayFlag::Moved));
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(DisplayFlag::SetMode));
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(DisplayFlag::SetMain));
  CHECK_FALSE(displayReconfigurationMayChangeMonitors(
    DisplayFlag::Moved | DisplayFlag::SetMode | DisplayFlag::SetMain | DisplayFlag::DesktopShapeChanged));
}

TEST_CASE("enable, disable and mirror changes re-read the list", "[DisplayReconfiguration]")
{
  CHECK(displayReconfigurationMayChangeMonitors(DisplayFlag::Enabled));
  CHECK(displayReconfigurationMayChangeMonitors(DisplayFlag::Disabled));
  CHECK(displayReconfigurationMayChangeMonitors(DisplayFlag::Mirror));
  CHECK(displayReconfigurationMayChangeMonitors(DisplayFlag::UnMirror));
}
