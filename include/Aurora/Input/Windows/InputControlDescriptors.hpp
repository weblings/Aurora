#pragma once

#include <vector>

#include <Aurora/Contracts/ControlDescriptor.hpp>

// This plugin's tooltip descriptor content (see
// Analysis/TooltipsAnalysis.md): the monitor picker (video). No sink
// entry -- Windows audio uses the system default device with no text
// field (DeviceField renders static text), so there is no control to
// describe; add `input.sink` here if a sink picker ever appears.
// Descriptions carry the approved Analysis/TooltipContent.md copy. Pure
// data -- no capture dependency, so this compiles into the base library
// unconditionally.
namespace Aurora::Input::Windows
{
  std::vector<Aurora::Contracts::ControlDescriptor> windowsInputControlDescriptors();
}
