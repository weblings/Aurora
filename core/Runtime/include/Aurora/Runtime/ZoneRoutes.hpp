#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>

#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Unlike SettingsRoutes/MonitorsRoute (registered directly in each app's
// main.cpp because they need Registry/PipelineHost, both app-layer), this
// can live in core: ZoneMap/ZoneConfig/Contracts::UVs are already core
// types, so the only app-specific piece is *how* to reach the live
// Orchestrator -- expressed as two generic callbacks, the same bridging
// pattern SettingsRoutes already uses for its onConfigChanged. One
// registration function serves both apps instead of duplicating the JSON
// marshalling in each main.cpp the way step 11's monitors/reload routes had to.
namespace Aurora::Runtime
{
  struct ZoneListResult
  {
    // Empty when there's no live output to report on (audio mode, or no
    // outputs at all) -- see registerZoneRoutes' own header comment.
    std::string outputName;
    ZoneMap zones;
  };

  void registerZoneRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    std::function<ZoneListResult()> listZones,
    std::function<bool(
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    )> updateZone
  );
}
