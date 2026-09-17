#include <Aurora/Runtime/ZoneReconciler.hpp>

#include <algorithm>

namespace Aurora::Runtime
{
  ZoneMap reconcileZoneMap(
    const ZoneMap& savedZoneMap,
    const std::vector<uint8_t>& liveZoneIds
  )
  {
    ZoneMap reconciled;
    reconciled.reserve(liveZoneIds.size());

    for(uint8_t zoneId : liveZoneIds){
      auto it = std::find_if(savedZoneMap.begin(), savedZoneMap.end(), [zoneId](const ZoneConfig& zone){
        return zone.zoneId == zoneId;
      });

      // No saved mapping yet for this zone -- default active with full-frame
      // uvs (a generic whole-screen average) rather than guessing a region;
      // everConfigured stays false until it's actually written once.
      reconciled.push_back(it != savedZoneMap.end() ? *it : ZoneConfig{zoneId});
    }

    return reconciled;
  }
}
