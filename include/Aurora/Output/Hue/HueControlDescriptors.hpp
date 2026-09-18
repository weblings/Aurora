#pragma once

#include <vector>

#include <Aurora/Contracts/ControlDescriptor.hpp>

// This plugin's tooltip descriptor content (see
// Analysis/TooltipsAnalysis.md): bridge pairing fields plus the
// entertainment-configuration picker. Descriptions are the literal
// "Test" until copy is authored. No I/O dependency, so this compiles
// into the base library, not the IO-gated sources.
namespace Aurora::Output::Hue
{
  std::vector<Aurora::Contracts::ControlDescriptor> hueControlDescriptors();
}
