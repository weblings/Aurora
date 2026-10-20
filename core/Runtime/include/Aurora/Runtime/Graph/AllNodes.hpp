#pragma once

#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// The single place node families are registered. The runner, /api/nodes and
// tests all call this so the advertised list always matches what can load.
namespace Aurora::Runtime::Graph
{
  // includeAudio is ignored in builds without AURORA_RUNTIME_AUDIO_AVAILABLE.
  void registerAllNodes(NodeRegistry& registry, bool includeAudio);
}
