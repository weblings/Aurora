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

      // No saved mapping yet for this zone -- default inactive rather than
      // guessing a screen region for it.
      reconciled.push_back(it != savedZoneMap.end() ? *it : ZoneConfig{zoneId});
    }

    return reconciled;
  }
}
