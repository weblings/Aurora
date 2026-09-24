#include <catch2/catch_test_macros.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Output/Hue/DevLightTap.hpp>

using namespace Aurora::Output::Hue;


TEST_CASE("parseDevLightTapAddress defaults to 127.0.0.1:18244 on an empty value", "[DevLightTap]")
{
  DevLightTapAddress address = parseDevLightTapAddress("");

  CHECK(address.host == "127.0.0.1");
  CHECK(address.port == DefaultDevLightTapPort);
}


TEST_CASE("parseDevLightTapAddress overrides both host and port when both are given", "[DevLightTap]")
{
  DevLightTapAddress address = parseDevLightTapAddress("192.168.1.5:9000");

  CHECK(address.host == "192.168.1.5");
  CHECK(address.port == 9000);
}


TEST_CASE("parseDevLightTapAddress overrides only the port when the host is left empty", "[DevLightTap]")
{
  DevLightTapAddress address = parseDevLightTapAddress(":9000");

  CHECK(address.host == "127.0.0.1");
  CHECK(address.port == 9000);
}


TEST_CASE("parseDevLightTapAddress overrides only the host when there's no colon", "[DevLightTap]")
{
  DevLightTapAddress address = parseDevLightTapAddress("192.168.1.5");

  CHECK(address.host == "192.168.1.5");
  CHECK(address.port == DefaultDevLightTapPort);
}


TEST_CASE("parseDevLightTapAddress falls back to the default port on an unparseable one", "[DevLightTap]")
{
  DevLightTapAddress address = parseDevLightTapAddress("192.168.1.5:notaport");

  CHECK(address.host == "192.168.1.5");
  CHECK(address.port == DefaultDevLightTapPort);
}


TEST_CASE("buildDevLightTapPayload matches ChannelStream fields one to one", "[DevLightTap]")
{
  ChannelStreams channels{
    {1, 1.0f, 0.5f, 0.0f},
    {2, 0.0f, 0.0f, 1.0f}
  };

  nlohmann::json parsed = nlohmann::json::parse(buildDevLightTapPayload(channels));

  REQUIRE(parsed.at("zones").size() == 2);
  CHECK(parsed["zones"][0]["id"].get<uint8_t>() == 1);
  CHECK(parsed["zones"][0]["r"].get<float>() == 1.0f);
  CHECK(parsed["zones"][0]["g"].get<float>() == 0.5f);
  CHECK(parsed["zones"][0]["b"].get<float>() == 0.0f);
  CHECK(parsed["zones"][1]["id"].get<uint8_t>() == 2);
  CHECK(parsed["zones"][1]["b"].get<float>() == 1.0f);
}


TEST_CASE("buildDevLightTapPayload handles an empty ChannelStreams", "[DevLightTap]")
{
  ChannelStreams channels{};

  nlohmann::json parsed = nlohmann::json::parse(buildDevLightTapPayload(channels));

  CHECK(parsed.at("zones").empty());
}
