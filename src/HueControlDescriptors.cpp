#include <Aurora/Output/Hue/HueControlDescriptors.hpp>

namespace Aurora::Output::Hue
{
  std::vector<Aurora::Contracts::ControlDescriptor> hueControlDescriptors()
  {
    return {
      {"output.hue.bridgeAddress", "text", "Test"},
      {"output.hue.autodetect", "button", "Test"},
      {"output.hue.changeBridge", "button", "Test"},
      {"output.hue.entertainmentConfig", "dropdown", "Test"},
    };
  }
}
