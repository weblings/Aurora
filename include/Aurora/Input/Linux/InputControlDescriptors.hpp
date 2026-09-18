#pragma once

#include <vector>

#include <Aurora/Contracts/ControlDescriptor.hpp>

// This plugin's tooltip descriptor content (see
// Analysis/TooltipsAnalysis.md): the monitor picker (video) and the
// PipeWire sink field (audio). Descriptions are the literal "Test"
// until copy is authored. Pure data -- no capture dependency, so this
// compiles into the base library unconditionally.
namespace Aurora::Input::Linux
{
  std::vector<Aurora::Contracts::ControlDescriptor> linuxInputControlDescriptors();
}
