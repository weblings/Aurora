#include <Aurora/Input/Mac/InputControlDescriptors.hpp>

namespace Aurora::Input::Mac
{
  std::vector<Aurora::Contracts::ControlDescriptor> macInputControlDescriptors()
  {
    return {
      {"input.monitor", "dropdown", "Which display to capture"},
    };
  }
}
