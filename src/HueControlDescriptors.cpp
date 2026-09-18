#include <Aurora/Output/Hue/HueControlDescriptors.hpp>

namespace Aurora::Output::Hue
{
  std::vector<Aurora::Contracts::ControlDescriptor> hueControlDescriptors()
  {
    return {
      {"output.hue.bridgeAddress", "text", "Bridge network address"},
      {"output.hue.autodetect", "button", "Find bridge automatically"},
      {"output.hue.changeBridge", "button", "Switch to another bridge"},
      {"output.hue.entertainmentConfig", "dropdown", "Entertainment area to use"},
    };
  }
}
