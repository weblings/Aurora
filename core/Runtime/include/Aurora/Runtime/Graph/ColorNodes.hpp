#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 2 color and palette nodes (id8j.5), so a graph can build the audio
// color path from primitives and draw from a gradient param.
//
//   color.fromHSV, color.toHSV, color.brightness, color.mix,
//   color.hueShift, color.complement, color.fromGradient,
//   palette.randomAnchor, palette.pick
namespace Aurora::Runtime::Graph
{
  void registerColorNodes(NodeRegistry& registry);
}
