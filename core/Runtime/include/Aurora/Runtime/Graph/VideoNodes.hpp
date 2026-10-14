#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 1 video nodes (G2a, Aurora-ra4o.4): coarse wrappers around the
// existing video path, unchanged math -- Orchestrator::update grab +
// _prepareSource (rescale/dropAlpha) + composeFrame.
//
//   video.capture -> image.rescale -> image.dropAlpha -> zones.sample
//
// DevFrameDump decision (bead notes): G2a nodes do NOT publish the dev
// tap. Orchestrator::update still publishes the prepared source on the
// legacy path; the graph equivalent (post-dropAlpha image) gets its tap
// when G3 makes a host run the built-in Video graph (G2d only gates parity
// in tests), so there is exactly one tap per path and no per-node
// duplication.
namespace Aurora::Runtime::Graph
{
  void registerVideoNodes(NodeRegistry& registry);
}
