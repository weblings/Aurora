#pragma once

#include <string_view>

#include <Aurora/Input/IAudioInput.hpp>
#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

// Host services for I/O nodes (G1c, Aurora-ra4o.9). Graph::tick hands one
// to every EvalContext, so the NodeRegistry stays host-independent and a
// test can supply a fake. Defaults return nullptr: a node that needs a
// missing service throws, and the evaluator turns that into a GraphError.
namespace Aurora::Runtime::Graph
{
  class IGraphHost
  {
  public:
    virtual ~IGraphHost() = default;

    virtual Input::IVideoInput* videoInput() { return nullptr; }
    virtual Input::IAudioInput* audioInput() { return nullptr; }

    // By output name (the per-output binding param's value).
    virtual Output::IOutput* output(std::string_view /*name*/) { return nullptr; }

    // Live zone map for one output, read every tick so updateZone edits
    // apply without a graph reload.
    virtual const ZoneMap* zoneMap(std::string_view /*outputName*/) { return nullptr; }
  };
}
