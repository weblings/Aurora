#pragma once

#include <string>

// The HueStream v2 entertainment protocol header -- ported byte-for-byte from huenicorn.
namespace Aurora::Output::Hue
{
  enum ColorSpace
  {
    RGB = 0x00,
    XYB = 0x01,
  };

  struct HuestreamHeader
  {
    char protocolName[9] = {'H', 'u', 'e', 'S', 't', 'r', 'e', 'a', 'm'};
    char version[2] = {0x02, 0x00};
    char sequenceId = 0;
    char reserved1[2] = {0, 0};
    char colorSpace = static_cast<char>(ColorSpace::XYB);
    char reserved2 = 0;
    char entertainmentConfigurationId[36];

    void setColorSpace(
      char colorSpace
    );

    void setEntertainmentConfigurationId(
      const std::string& entertainmentConfigurationId
    );
  };
}
