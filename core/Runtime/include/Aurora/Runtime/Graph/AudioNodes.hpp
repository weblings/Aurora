#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 1 audio nodes (G2b, Aurora-ra4o.5): coarse wrappers around the
// existing audio path, unchanged math -- the former AudioOrchestrator read +
// AudioFeatureExtractor + updateDrift/updateBounce.
//
//   audio.capture -> audio.features -> audio.drift -> audio.bounce
//
// audio.drift outputs the drift anchor as an Angle; audio.bounce takes it
// as a required input (updateBounce re-targets anchor + offset every tick,
// Aurora-7r3). audio.drift resets on a fixedAnchorHue change to a
// different hue; bounce has no such param and resets when the anchor jumps
// (drift re-seeded), as the former AudioOrchestrator::setSettings did. Only available in audio-enabled builds
// (AURORA_RUNTIME_AUDIO_AVAILABLE), like GraphRunner's audio constructor.
namespace Aurora::Runtime::Graph
{
  void registerAudioNodes(NodeRegistry& registry);
}
