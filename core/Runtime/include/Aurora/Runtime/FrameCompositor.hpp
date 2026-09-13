#pragma once

#include <Aurora/Contracts/Frame.hpp>
#include <Aurora/Contracts/ImageData.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

// The generic half of huenicorn's per-tick Runtime::_update() loop -- crops
// and averages each active zone, independent of any specific IOutput.
namespace Aurora::Runtime
{
  // Crops `source` per each active zone's UVs and takes its dominant color.
  // Inactive zones are omitted from the result entirely.
  Contracts::Frame composeFrame(
    const Contracts::ImageData& source,
    const ZoneMap& zoneMap
  );
}
