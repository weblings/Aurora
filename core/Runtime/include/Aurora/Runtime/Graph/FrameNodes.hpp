#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// Tier 1 frame nodes (G2c, Aurora-ra4o.6): frame.smooth wraps Smoother and
// output.send wraps IOutput::send, unchanged. Both bind to one output via
// the "output" param (smoother state is keyed per output, so one
// frame.smooth per output). frame.broadcast wraps composeAudioFrame and
// lives in AudioNodes.hpp, since that function is audio-build gated.
namespace Aurora::Runtime::Graph
{
  void registerFrameNodes(NodeRegistry& registry);
}
