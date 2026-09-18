#include <Aurora/Input/Linux/InputControlDescriptors.hpp>

namespace Aurora::Input::Linux
{
  std::vector<Aurora::Contracts::ControlDescriptor> linuxInputControlDescriptors()
  {
    return {
      {"input.monitor", "dropdown", "Test"},
      {"input.sink", "text", "Test"},
    };
  }
}
