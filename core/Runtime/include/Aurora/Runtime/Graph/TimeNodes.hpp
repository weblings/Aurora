#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 2 time/state nodes (id8j.4). Every smoothing node takes tau in
// seconds and blends by 1 - exp(-dt/tau) on the nominal dt, so settle time
// matches at any tick rate. A non-finite input fails the node.
//
//   smooth.exp, smooth.angle, rollingAverage, integrate, stepOnTrigger, lfo
namespace Aurora::Runtime::Graph
{
  void registerTimeNodes(NodeRegistry& registry);
}
