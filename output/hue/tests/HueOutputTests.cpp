#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <Aurora/Output/Hue/Colorimetry.hpp>
#include <Aurora/Output/Hue/Channel.hpp>
#include <Aurora/Output/Hue/HuestreamHeader.hpp>
#include <Aurora/Output/Hue/HuestreamPayload.hpp>
#include <Aurora/Output/Hue/BridgeAddress.hpp>
#include <Aurora/Output/Hue/Credentials.hpp>

using namespace Aurora::Output::Hue;
using namespace Aurora::Contracts;


TEST_CASE("toXYB maps black to XYBBlack exactly", "[Colorimetry]")
{
  CHECK(toXYB(Color(0, 0, 0)) == XYBBlack);
}


TEST_CASE("toXYB maps white near the D65 white point with full brightness", "[Colorimetry]")
{
  glm::vec3 xyb = toXYB(Color(255, 255, 255));

  CHECK(xyb.x == Catch::Approx(0.3127).margin(0.001));
  CHECK(xyb.y == Catch::Approx(0.3290).margin(0.001));
  CHECK(xyb.z == Catch::Approx(1.0));
}


TEST_CASE("Channel::gammaExponent is 2^(-gammaFactor*2)", "[Channel]")
{
  CHECK(Channel(true, {}, 0.f).gammaExponent() == Catch::Approx(1.0f));
  CHECK(Channel(true, {}, 1.f).gammaExponent() == Catch::Approx(0.25f));
  CHECK(Channel(true, {}, -1.f).gammaExponent() == Catch::Approx(4.0f));
}


TEST_CASE("Channel::setUV moves the requested corner and expands the opposite bound", "[Channel]")
{
  Channel channel(true, {}, 0.f);

  channel.setUV({0.2f, 0.3f}, UVCorner::TopLeft);
  CHECK(channel.uvs.min.x == Catch::Approx(0.2f));
  CHECK(channel.uvs.min.y == Catch::Approx(0.3f));

  channel.setUV({0.8f, 0.9f}, UVCorner::BottomRight);
  CHECK(channel.uvs.max.x == Catch::Approx(0.8f));
  CHECK(channel.uvs.max.y == Catch::Approx(0.9f));

  // Out-of-range input is clamped, not rejected.
  channel.setUV({-1.f, 2.f}, UVCorner::TopLeft);
  CHECK(channel.uvs.min.x == Catch::Approx(0.f));
  CHECK(channel.uvs.min.y == Catch::Approx(1.f));
}


TEST_CASE("Channel state transitions", "[Channel]")
{
  Channel channel(false, {}, 0.f);
  CHECK(channel.state == Channel::State::Inactive);

  channel.setActive(true);
  CHECK(channel.state == Channel::State::Active);

  channel.setActive(false);
  CHECK(channel.state == Channel::State::PendingShutdown);

  channel.acknowledgeShutdown();
  CHECK(channel.state == Channel::State::Inactive);
}


TEST_CASE("HuestreamHeader field setters pack bytes correctly", "[HuestreamHeader]")
{
  HuestreamHeader header;

  header.setColorSpace(static_cast<char>(ColorSpace::RGB));
  CHECK(header.colorSpace == static_cast<char>(ColorSpace::RGB));

  std::string id = "abc";
  header.setEntertainmentConfigurationId(id);
  CHECK(std::string(header.entertainmentConfigurationId, 3) == "abc");
  // Rest of the 36-byte buffer must be zeroed, not left with stale data.
  CHECK(header.entertainmentConfigurationId[3] == 0);
  CHECK(header.entertainmentConfigurationId[35] == 0);
}


TEST_CASE("HuestreamPayload field setters pack 16-bit values big-endian", "[HuestreamPayload]")
{
  HuestreamPayload payload;

  payload.setChannelId(5);
  CHECK(payload.channelId == 5);

  payload.setR(0x1234);
  CHECK(static_cast<uint8_t>(payload.colorData0[0]) == 0x12);
  CHECK(static_cast<uint8_t>(payload.colorData0[1]) == 0x34);

  payload.setG(0xffff);
  CHECK(static_cast<uint8_t>(payload.colorData1[0]) == 0xff);
  CHECK(static_cast<uint8_t>(payload.colorData1[1]) == 0xff);

  payload.setB(0x0000);
  CHECK(static_cast<uint8_t>(payload.colorData2[0]) == 0x00);
  CHECK(static_cast<uint8_t>(payload.colorData2[1]) == 0x00);
}


TEST_CASE("sanitizeBridgeAddress strips protocol, path, and trailing slashes", "[BridgeAddress]")
{
  CHECK(sanitizeBridgeAddress("https://192.168.1.10") == "192.168.1.10");
  CHECK(sanitizeBridgeAddress("HTTP://192.168.1.10") == "192.168.1.10");
  CHECK(sanitizeBridgeAddress("192.168.1.10/") == "192.168.1.10");
  CHECK(sanitizeBridgeAddress("192.168.1.10///") == "192.168.1.10");
  CHECK(sanitizeBridgeAddress("https://192.168.1.10/api/config") == "192.168.1.10");
  CHECK(sanitizeBridgeAddress("192.168.1.10") == "192.168.1.10");
}


TEST_CASE("Credentials byte conversions round-trip", "[Credentials]")
{
  Credentials credentials("my-username", "a1b2c3");

  auto usernameBytes = credentials.usernameBytes();
  REQUIRE(usernameBytes.size() == 11);
  CHECK(usernameBytes[0] == 'm');

  auto clientkeyBytes = credentials.clientkeyBytes();
  REQUIRE(clientkeyBytes.size() == 3);
  CHECK(clientkeyBytes[0] == 0xa1);
  CHECK(clientkeyBytes[1] == 0xb2);
  CHECK(clientkeyBytes[2] == 0xc3);
}


TEST_CASE("Credentials::clientkeyBytes rejects an odd-length hex string", "[Credentials][regression]")
{
  Credentials credentials("user", "abc");
  CHECK_THROWS_AS(credentials.clientkeyBytes(), std::runtime_error);
}
