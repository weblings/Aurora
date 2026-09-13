#pragma once

#include <vector>

#include <glm/vec2.hpp>

// Picks a sane default subsample width when Config doesn't have one yet.
// Ported from huenicorn's Runtime::_initSettings() inline search.
namespace Aurora::Runtime
{
  // The smallest candidate width that's still >= percentThreshold% of the
  // full display width -- the cheapest subsample that isn't degenerately
  // tiny. Falls back to the smallest candidate if none clear the threshold,
  // or 0 if there are no candidates at all.
  int pickDefaultSubsampleWidth(
    const std::vector<glm::ivec2>& subsampleCandidates,
    int displayWidth,
    float percentThreshold = 1.f
  );
}
