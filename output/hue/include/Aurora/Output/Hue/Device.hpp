#pragma once

#include <string>
#include <vector>

namespace Aurora::Output::Hue
{
  struct Device
  {
    std::string id;   // entertainment-service rid -- matches channels[].members[].service.rid
    std::string name;
    std::string lightId; // light-service rid -- what /clip/v2/resource/light/{id} actually needs
  };

  using Devices = std::vector<Device>;
}
