#pragma once

#include <vector>

#include <Aurora/Contracts/ControlDescriptor.hpp>

// This plugin's tooltip descriptor content (see docs/TooltipsAnalysis.md
// and input/linux's own InputControlDescriptors.hpp, which this mirrors).
// Video-only, unlike Linux's two entries -- Mac tier 1 has no audio input
// at all (docs/MacSupport.md, "Deferred: audio"), so there's no PipeWire-
// sink-equivalent field to describe yet. Pure data -- no capture
// dependency, so this compiles into the base library unconditionally.
namespace Aurora::Input::Mac
{
  std::vector<Aurora::Contracts::ControlDescriptor> macInputControlDescriptors();
}
