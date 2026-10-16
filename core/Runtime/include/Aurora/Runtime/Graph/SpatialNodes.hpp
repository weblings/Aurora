#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 2 spatial Image generators (id8j.7). Each renders a small RGB image
// that zones.sample reads, so zone position comes from the ZoneMap and
// Frame needs no position.
//
//   image.gradient, image.bar, image.hueRamp
namespace Aurora::Runtime::Graph
{
  void registerSpatialNodes(NodeRegistry& registry);
}
