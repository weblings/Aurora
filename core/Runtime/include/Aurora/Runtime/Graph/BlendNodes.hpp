#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 2 frame and image ops with blend modes (id8j.6), so video and audio
// frames can be mixed and graded in a graph.
//
//   frame.mix, frame.brightnessScale, frame.saturation, frame.hueShift,
//   frame.tint, image.mix
//
// Blend modes: normal, add, multiply, screen, difference.
namespace Aurora::Runtime::Graph
{
  void registerBlendNodes(NodeRegistry& registry);
}
