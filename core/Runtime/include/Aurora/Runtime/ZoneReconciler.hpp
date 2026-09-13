#pragma once

#include <cstdint>
#include <vector>

#include <Aurora/Runtime/ZoneMap.hpp>

// Merges a saved zone map against an output's live zone IDs -- same shape
// as SessionDispatch: pure decision logic pulled out of what was previously
// only reachable through a real bridge/device connection.
namespace Aurora::Runtime
{
  // Known IDs keep their saved uvs/active; live IDs missing from the saved
  // map come back inactive with full-frame UVs; saved IDs no longer live
  // (e.g. a removed bridge channel) are dropped.
  ZoneMap reconcileZoneMap(
    const ZoneMap& savedZoneMap,
    const std::vector<uint8_t>& liveZoneIds
  );
}
