#include <Aurora/Input/Windows/InputControlDescriptors.hpp>

namespace Aurora::Input::Windows
{
  std::vector<Aurora::Contracts::ControlDescriptor> windowsInputControlDescriptors()
  {
    return {
      {"input.monitor", "dropdown", "Test"},
    };
  }
}
