#pragma once

#include <cstdint>
#include <vector>

#include <Aurora/Contracts/UV.hpp>

// Generic screen-region assignment: which UV rect feeds which output zone,
// and whether it's active. No output-specific data (gamma, device IDs,
// DMX addresses, ...) lives here -- that stays inside each IOutput plugin.
namespace Aurora::Runtime
{
  struct ZoneConfig
  {
    uint8_t zoneId{0};
    Contracts::UVs uvs{{0.f, 0.f}, {1.f, 1.f}};
    bool active{false};

    // Generic brightness-curve tuning knob -- see Contracts::Zone::gamma.
    float gamma{0.f};
  };

  using ZoneMap = std::vector<ZoneConfig>;
}
