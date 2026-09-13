#pragma once

#include <string>
#include <unordered_map>
#include <utility>

#include <Aurora/Output/Hue/Channel.hpp>
#include <Aurora/Output/Hue/Device.hpp>

namespace Aurora::Output::Hue
{
  struct EntertainmentConfiguration
  {
    std::string name;
    Devices devices;
    Channels channels;
  };

  using EntertainmentConfigurations = std::unordered_map<std::string, EntertainmentConfiguration>;
  using EntertainmentConfigurationsIterator = EntertainmentConfigurations::iterator;
  using EntertainmentConfigurationEntry = std::pair<std::string, EntertainmentConfiguration>;
}
