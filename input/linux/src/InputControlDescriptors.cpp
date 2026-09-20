#include <Aurora/Input/Linux/InputControlDescriptors.hpp>

namespace Aurora::Input::Linux
{
  std::vector<Aurora::Contracts::ControlDescriptor> linuxInputControlDescriptors()
  {
    return {
      {"input.monitor", "dropdown", "Which display to capture"},
      {"input.sink", "text", "Audio source to react to"},
    };
  }
}
