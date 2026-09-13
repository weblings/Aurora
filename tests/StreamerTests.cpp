#include <catch2/catch_test_macros.hpp>

#include <cstring>

#include <Aurora/Output/Hue/HuestreamPayload.hpp>
#include <Aurora/Output/Hue/Streamer.hpp>

using namespace Aurora::Output::Hue;


TEST_CASE("buildStreamRequest lays out the header followed by one payload per channel", "[Streamer]")
{
  HuestreamHeader header;
  header.setEntertainmentConfigurationId("test-config-id");

  ChannelStreams channels{
    {1, 1.0f, 0.5f, 0.0f},
    {2, 0.0f, 0.0f, 1.0f}
  };

  std::vector<std::byte> buffer = buildStreamRequest(header, channels);

  REQUIRE(buffer.size() == sizeof(HuestreamHeader) + 2 * sizeof(HuestreamPayload));

  HuestreamHeader headerFromBuffer;
  std::memcpy(&headerFromBuffer, buffer.data(), sizeof(HuestreamHeader));
  CHECK(std::memcmp(&headerFromBuffer, &header, sizeof(HuestreamHeader)) == 0);

  HuestreamPayload firstPayload;
  std::memcpy(&firstPayload, buffer.data() + sizeof(HuestreamHeader), sizeof(HuestreamPayload));
  CHECK(firstPayload.channelId == 1);
  // setR(0xffff * 1.0) == 0xffff -- big-endian, high byte first.
  CHECK(static_cast<uint8_t>(firstPayload.colorData0[0]) == 0xff);
  CHECK(static_cast<uint8_t>(firstPayload.colorData0[1]) == 0xff);

  HuestreamPayload secondPayload;
  std::memcpy(&secondPayload, buffer.data() + sizeof(HuestreamHeader) + sizeof(HuestreamPayload), sizeof(HuestreamPayload));
  CHECK(secondPayload.channelId == 2);
}


TEST_CASE("buildStreamRequest produces just the header for no channels", "[Streamer]")
{
  HuestreamHeader header;
  std::vector<std::byte> buffer = buildStreamRequest(header, {});

  CHECK(buffer.size() == sizeof(HuestreamHeader));
}
