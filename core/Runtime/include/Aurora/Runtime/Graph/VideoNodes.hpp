#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 1 video nodes (G2a, Aurora-ra4o.4): coarse wrappers around the
// video path, math unchanged from the former Orchestrator.
//
//   video.capture -> image.rescale -> image.dropAlpha -> zones.sample
//
// DevFrameDump: the nodes do not publish the dev tap. GraphRunner::tick
// publishes the post-dropAlpha image of the built-in Video graph.
namespace Aurora::Runtime::Graph
{
  void registerVideoNodes(NodeRegistry& registry);
}
