#include <catch2/catch_test_macros.hpp>

#include <Aurora/Input/Windows/MonitorKey.hpp>

using Aurora::Input::Windows::edidRegistryKey;
using Aurora::Input::Windows::monitorIdentities;


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


TEST_CASE("monitorIdentities ignores order and renumbered names of keyed outputs", "[MonitorKey]")
{
  CHECK(monitorIdentities({"aaaa", "bbbb"}, {"DISPLAY1", "DISPLAY2"})
    == monitorIdentities({"bbbb", "aaaa"}, {"DISPLAY1", "DISPLAY3"}));
}


TEST_CASE("monitorIdentities sees a plugged or unplugged output", "[MonitorKey]")
{
  CHECK(monitorIdentities({"aaaa"}, {"DISPLAY1"}) != monitorIdentities({"aaaa", "bbbb"}, {"DISPLAY1", "DISPLAY2"}));
}


TEST_CASE("monitorIdentities falls back to the name for keyless outputs", "[MonitorKey]")
{
  CHECK(monitorIdentities({""}, {"DISPLAY1"}) != monitorIdentities({""}, {"DISPLAY2"}));
  CHECK(monitorIdentities({""}, {"DISPLAY1"}) == monitorIdentities({""}, {"DISPLAY1"}));
}
