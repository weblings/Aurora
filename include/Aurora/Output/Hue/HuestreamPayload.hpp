#pragma once

#include <cstdint>

// One channel's color entry in a HueStream packet -- ported byte-for-byte from huenicorn.
namespace Aurora::Output::Hue
{
  struct HuestreamPayload
  {
    char channelId;
    char colorData0[2];
    char colorData1[2];
    char colorData2[2];

    inline void setChannelId(char id)
    {
      channelId = id;
    }

    inline void setR(uint16_t red)
    {
      colorData0[0] = static_cast<uint8_t>((red >> 8) & 0xff);
      colorData0[1] = static_cast<uint8_t>(red & 0xff);
    }

    inline void setG(uint16_t green)
    {
      colorData1[0] = static_cast<uint8_t>((green >> 8) & 0xff);
      colorData1[1] = static_cast<uint8_t>(green & 0xff);
    }

    inline void setB(uint16_t blue)
    {
      colorData2[0] = static_cast<uint8_t>((blue >> 8) & 0xff);
      colorData2[1] = static_cast<uint8_t>(blue & 0xff);
    }
  };
}
