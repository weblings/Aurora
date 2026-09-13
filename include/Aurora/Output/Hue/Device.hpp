#pragma once

#include <string>
#include <vector>

namespace Aurora::Output::Hue
{
  struct Device
  {
    std::string id;
    std::string name;
  };

  using Devices = std::vector<Device>;
}
