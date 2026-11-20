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
    bool active{true};

    // Generic brightness-curve tuning knob -- see Contracts::Zone::gamma.
    float gamma{0.f};

    // Presence flag, decoupled from active/uvs/gamma's own meaning: true once
    // updateZone() has written this zone at least once. Needed because
    // active's default can't double as a "never configured" signal (a
    // zero-value default is indistinguishable from a real value that happens
    // to match it -- protobuf3's scalar-presence problem). See
    // docs/WebUI/WebUI_Design_2ndPass.md's "Decisions/spikes" section.
    bool everConfigured{false};
  };

  using ZoneMap = std::vector<ZoneConfig>;

  // The editor's "Sim: basic room" layout: 4 screen quadrants, ids 0..3. Kept equal to
  // tools/fake-hue-bridge/room-4zone-zonemap.json and the web demo's ROOM_ZONE_MAP by tests.
  inline ZoneMap basicRoomZoneMap()
  {
    ZoneMap map;
    for(uint8_t i = 0; i < 4; ++i){
      ZoneConfig zone;
      zone.zoneId = i;
      const float x = (i % 2) * 0.5f;
      const float y = (i / 2) * 0.5f;
      zone.uvs = {{x, y}, {x + 0.5f, y + 0.5f}};
      zone.everConfigured = true;
      map.push_back(zone);
    }
    return map;
  }}
