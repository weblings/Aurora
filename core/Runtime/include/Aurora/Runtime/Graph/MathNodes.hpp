#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 2 scalar math (id8j.3): stateless Float -> Float nodes that let a
// graph rebuild the compound audio nodes from primitives. A non-finite
// result fails the node (a GraphError), never a NaN on a Float port.
//
//   math.scale, math.divide, math.clamp, math.mapRange, math.lerp,
//   math.add, math.multiply, math.max, math.invert
namespace Aurora::Runtime::Graph
{
  void registerMathNodes(NodeRegistry& registry);
}
