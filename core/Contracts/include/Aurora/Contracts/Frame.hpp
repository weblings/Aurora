#pragma once

#include <cstdint>
#include <vector>

#include <Aurora/Contracts/Color.hpp>

// The Processing->Output contract (ModuleSplitPlan.md/HueOutputAnalysis.md).
// Zone.color is generic linear color -- target-specific transforms (e.g. toXYB) run in the Output plugin, not here.
namespace Aurora::Contracts
{
  struct Zone
  {
    uint8_t id;
    Color color;
  };

  using Frame = std::vector<Zone>;
}
