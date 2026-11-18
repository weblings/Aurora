#pragma once

#include <nlohmann/json.hpp>

#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

// The one parser for the zone map JSON shape ZoneMapStore saves. Shared by the
// native store and the browser engine. Throws nlohmann::json::exception on a wrong type.
namespace Aurora::Runtime
{
  // {"min": [u, v], "max": [u, v]}. A missing or malformed side keeps its default.
  Contracts::UVs uvsFromJson(const nlohmann::json& json);

  // {"zoneId", "uvs", "active", "gamma", "everConfigured"}.
  ZoneConfig zoneFromJson(const nlohmann::json& json);

  // An array of zones. Throws when `json` is not an array.
  ZoneMap zoneMapFromJson(const nlohmann::json& json);
}
