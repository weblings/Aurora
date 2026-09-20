#pragma once

#include <Aurora/Contracts/Color.hpp>
#include <Aurora/Contracts/Frame.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

// The audio sibling of FrameCompositor's composeFrame() -- broadcasts one
// color to every active zone instead of cropping a per-zone region, since
// audio has no per-zone spatial concept at all (see docs/AudioAnalysis.md:
// "one global Frame computed from AudioFeatures, applied to every zone").
namespace Aurora::Runtime
{
  // Inactive zones are omitted entirely, same convention as composeFrame.
  Contracts::Frame composeAudioFrame(
    const Contracts::Color& color,
    const ZoneMap& zoneMap
  );
}
