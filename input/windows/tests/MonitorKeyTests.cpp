#include <catch2/catch_test_macros.hpp>

#include <Aurora/Input/Windows/MonitorKey.hpp>

using Aurora::Input::Windows::edidRegistryKey;


TEST_CASE("edidRegistryKey maps a monitor device path to its registry key", "[MonitorKey]")
{
  CHECK(edidRegistryKey("\\\\?\\DISPLAY#DELA0B9#5&1ca565dc&0&UID4358#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}")
    == "SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\DELA0B9\\5&1ca565dc&0&UID4358\\Device Parameters");
}


TEST_CASE("edidRegistryKey is empty for a path that is not a display device path", "[MonitorKey]")
{
  CHECK(edidRegistryKey("").empty());
  CHECK(edidRegistryKey("\\\\.\\DISPLAY1").empty());
  CHECK(edidRegistryKey("\\\\?\\USB#VID_1234#5").empty());
  CHECK(edidRegistryKey("\\\\?\\DISPLAY#DELA0B9").empty());
  CHECK(edidRegistryKey("\\\\?\\DISPLAY##inst#{g}").empty());
}
