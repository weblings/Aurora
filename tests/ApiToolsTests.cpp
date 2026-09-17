#include <catch2/catch_test_macros.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Output/Hue/ApiTools.hpp>

using namespace Aurora::Output::Hue;
using Json = nlohmann::json;


TEST_CASE("parseEntertainmentConfigurationShell extracts name, placeholder devices, and empty channels", "[ApiTools]")
{
  Json json = Json::parse(R"({
    "metadata": {"name": "Living Room"},
    "light_services": [{"rid": "light-1"}, {"rid": "light-2"}],
    "channels": [{"channel_id": 0}, {"channel_id": 1}]
  })");

  EntertainmentConfiguration entConf = ApiTools::parseEntertainmentConfigurationShell(json);

  CHECK(entConf.name == "Living Room");
  REQUIRE(entConf.devices.size() == 2);
  CHECK(entConf.devices[0].id == "light-1");
  CHECK(entConf.devices[0].name.empty()); // filled in by a later per-device fetch

  REQUIRE(entConf.channels.size() == 2);
  CHECK(entConf.channels.at(0).state == Channel::State::Inactive);
  CHECK(entConf.channels.at(1).gammaFactor == 0.f);
}


TEST_CASE("parseLightName extracts the light's display name", "[ApiTools]")
{
  Json json = Json::parse(R"({"data": [{"metadata": {"name": "Floor Lamp"}}]})");
  CHECK(ApiTools::parseLightName(json) == "Floor Lamp");
}


TEST_CASE("parseDevicesFromResource keeps only entertainment-capable devices", "[ApiTools]")
{
  Json json = Json::parse(R"({
    "data": [
      {"type": "device", "metadata": {"name": "Lamp A"}, "services": [
        {"rtype": "entertainment", "rid": "ent-1"},
        {"rtype": "light", "rid": "light-1"}
      ]},
      {"type": "device", "metadata": {"name": "Lamp B"}, "services": [
        {"rtype": "light", "rid": "light-2"}
      ]},
      {"type": "room", "metadata": {"name": "Not a device"}, "services": []}
    ]
  })");

  Devices devices = ApiTools::parseDevicesFromResource(json);

  REQUIRE(devices.size() == 1);
  CHECK(devices[0].id == "ent-1");
  CHECK(devices[0].name == "Lamp A");
}


TEST_CASE("parseEntertainmentConfigurationsChannels maps each channel to its member device IDs", "[ApiTools]")
{
  Json json = Json::parse(R"({
    "data": [
      {"id": "conf-1", "channels": [
        {"channel_id": 0, "members": [{"service": {"rid": "light-1"}}, {"service": {"rid": "light-2"}}]},
        {"channel_id": 1, "members": [{"service": {"rid": "light-3"}}]}
      ]}
    ]
  })");

  EntertainmentConfigurationsChannels channels = ApiTools::parseEntertainmentConfigurationsChannels(json);

  REQUIRE(channels.count("conf-1") == 1);
  CHECK(channels.at("conf-1").at(0).count("light-1") == 1);
  CHECK(channels.at("conf-1").at(0).count("light-2") == 1);
  CHECK(channels.at("conf-1").at(1).count("light-3") == 1);
}


TEST_CASE("matchDevices keeps only devices present in membersIds", "[ApiTools]")
{
  Devices devices{{"a", "A"}, {"b", "B"}, {"c", "C"}};
  MembersIds members{"a", "c"};

  Devices matched = ApiTools::matchDevices(members, devices);

  REQUIRE(matched.size() == 2);
  CHECK(matched[0].id == "a");
  CHECK(matched[1].id == "c");
}


TEST_CASE("parseLightSnapshot extracts on/brightness/xy from a light response", "[ApiTools]")
{
  Json json = Json::parse(R"({
    "data": [{
      "on": {"on": false},
      "dimming": {"brightness": 42.5},
      "color": {"xy": {"x": 0.31, "y": 0.32}}
    }]
  })");

  ApiTools::LightSnapshot snapshot = ApiTools::parseLightSnapshot(json);

  CHECK_FALSE(snapshot.on);
  CHECK(snapshot.brightness == 42.5f);
  CHECK(snapshot.xy.x == 0.31f);
  CHECK(snapshot.xy.y == 0.32f);
}


TEST_CASE("parseLightSnapshot defaults to on/full-brightness/origin when fields are missing", "[ApiTools]")
{
  Json json = Json::parse(R"({"data": [{}]})");

  ApiTools::LightSnapshot snapshot = ApiTools::parseLightSnapshot(json);

  CHECK(snapshot.on);
  CHECK(snapshot.brightness == 100.f);
  CHECK(snapshot.xy.x == 0.f);
  CHECK(snapshot.xy.y == 0.f);
}


TEST_CASE("lightPutBody shapes on/dimming/color/dynamics as sibling fields", "[ApiTools]")
{
  Json body = ApiTools::lightPutBody(true, 75.f, {0.4f, 0.5f}, 400);

  CHECK(body.at("on").at("on") == true);
  CHECK(body.at("dimming").at("brightness") == 75.f);
  CHECK(body.at("color").at("xy").at("x") == 0.4f);
  CHECK(body.at("color").at("xy").at("y") == 0.5f);
  CHECK(body.at("dynamics").at("duration") == 400);
}
