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

    // User-tunable brightness-curve factor, persisted per-zone in
    // Runtime::ZoneMap and carried through here so an Output can apply
    // whatever gamma formula/colorspace makes sense for it (see
    // RuntimeAnalysis.md) -- 0 means "no correction." Not smoothed/eased,
    // only color is.
    float gamma{0.f};
  };

  using Frame = std::vector<Zone>;
}
