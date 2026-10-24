#include <catch2/catch_test_macros.hpp>

#include <string>
#include <vector>

#include <Aurora/Input/Linux/X11MonitorKey.hpp>

using namespace Aurora::Input::Linux;


TEST_CASE("edidHashKey is stable and empty without an EDID", "[X11MonitorKey]")
{
  const unsigned char edid[] = {0x00, 0xff, 0xff, 0x12, 0x34};

  CHECK(edidHashKey(edid, sizeof(edid)).size() == 16);
  CHECK(edidHashKey(edid, sizeof(edid)) == edidHashKey(edid, sizeof(edid)));
  CHECK(edidHashKey(edid, sizeof(edid) - 1) != edidHashKey(edid, sizeof(edid)));
  CHECK(edidHashKey(edid, 0).empty());
  CHECK(edidHashKey(nullptr, 5).empty());
}


TEST_CASE("assignMonitorKeys uses the bare hash when the EDID is unique", "[X11MonitorKey]")
{
  const auto keys = assignMonitorKeys({"aaaa", "bbbb"}, {"DP-1", "HDMI-1"});

  CHECK(keys == std::vector<std::string>{"aaaa", "bbbb"});
}


TEST_CASE("assignMonitorKeys survives a connector rename", "[X11MonitorKey]")
{
  CHECK(assignMonitorKeys({"aaaa"}, {"DP-1"}) == assignMonitorKeys({"aaaa"}, {"DP-1-8"}));
}


TEST_CASE("assignMonitorKeys appends the connector only for shared EDIDs", "[X11MonitorKey]")
{
  const auto keys = assignMonitorKeys({"aaaa", "bbbb", "aaaa"}, {"DP-1", "HDMI-1", "DP-2"});

  CHECK(keys == std::vector<std::string>{"aaaa@DP-1", "bbbb", "aaaa@DP-2"});
}


TEST_CASE("assignMonitorKeys leaves outputs without an EDID keyless", "[X11MonitorKey]")
{
  const auto keys = assignMonitorKeys({"", "", "aaaa"}, {"DP-1", "DP-2", "DP-3"});

  CHECK(keys == std::vector<std::string>{"", "", "aaaa"});
}
