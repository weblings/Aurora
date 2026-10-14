#pragma once

#include <string>
#include <unordered_set>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// graph.json loader/validator (G1, Aurora-ra4o.2). Frozen format source:
// docs/planning/NodeGraphPipeline.md "Frozen format (G0)".
//
// ```json
// {
//   "version": 1,
//   "tickHz": 60,
//   "nodes": [{"id": "cap", "type": "video.capture", "params": {}}],
//   "edges": [["cap.image", "zones.image"]],
//   "controls": [{"node": "beat", "param": "amount"}],
//   "ui": {"cap": {"x": 40, "y": 80}}
// }
// ```
//
// Rejects: unknown type, port-type mismatch, cycle, missing required
// input, unregistered output, more than one edge into one input
// (including one output's send), duplicate node id, unknown
// node/port in an edge, unknown or mistyped param, malformed controls.
// `ui` is editor-only and ignored. Every error names the node, port and
// expectation so an agent can retry from the message alone.
namespace Aurora::Runtime::Graph
{
  struct LoadOptions
  {
    // Known output names for the per-output binding params (zones.sample,
    // frame.broadcast, output.send). Empty skips the unregistered-output
    // check (core has no output list of its own; the app passes its
    // Registry::outputNames()).
    std::unordered_set<std::string> knownOutputs{};
  };

  struct LoadResult
  {
    bool ok = false;
    std::string error; // set when !ok
    Graph graph;       // valid only when ok
  };

  LoadResult loadGraph(
    const nlohmann::json& doc,
    const NodeRegistry& registry,
    const LoadOptions& options = {});

  inline LoadResult loadGraphFromString(
    const std::string& text,
    const NodeRegistry& registry,
    const LoadOptions& options = {})
  {
    try{
      return loadGraph(nlohmann::json::parse(text), registry, options);
    } catch(const std::exception& e){
      LoadResult result;
      result.error = std::string("invalid JSON: ") + e.what();
      return result;
    }
  }
}
