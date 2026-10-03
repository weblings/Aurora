#pragma once

#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

namespace Aurora::Network::Http::Server { class HttpServer; }

// ZoneMap/ZoneConfig/Contracts::UVs are core types, so the only
// app-specific piece is *how* to reach the live Orchestrator -- expressed
// as two generic callbacks, the same bridging pattern SettingsRoutes uses
// for its onConfigChanged. One registration function serves every app
// instead of duplicating the JSON marshalling in each main.cpp.
namespace Aurora::Runtime
{
  struct ZoneListResult
  {
    // Empty when there's no live output to report on (audio mode, or no
    // outputs at all) -- see registerZoneRoutes' own header comment.
    std::string outputName;
    ZoneMap zones;
    // From the live output's IOutput::zoneLabels() -- served by
    // GET /api/zones/labels, not /api/zones itself.
    std::map<std::uint8_t, std::vector<std::string>> labels;
  };

  void registerZoneRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    std::function<ZoneListResult()> listZones,
    std::function<bool(
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    )> updateZone,
    // PUT /api/zones answers 409 "paused" while this is true (Aurora-3ddb):
    // zone edits need live lights to be meaningful. Null = never paused.
    std::function<bool()> isPaused = {}
  );
}
