#pragma once

#include <string>
#include <unordered_set>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// graph.json loader/validator (G1, Aurora-ra4o.2). Frozen format source:
// docs/planning/NodeGraphPipeline.md "Frozen format (G0)".
//
// ```json
// {
//   "version": 1,
//   "minorVersion": 1,
//   "title": "Rainbow sweep",
//   "description": "Colors drift across the lights.",
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
// A control may carry extra keys ("config", "section") for Tuning; the loader
// ignores them. `ui` is editor-only and ignored. Every error names the node, port and
// expectation so an agent can retry from the message alone. All node, edge and
// controls problems are collected in `issues`; top-level shape problems
// (not an object, version, nodes) stop at the first.
namespace Aurora::Runtime::Graph
{
  // Byte limits for the optional top-level title and description (Aurora-mfud).
  constexpr std::size_t kMaxTitleLength = 60;
  constexpr std::size_t kMaxDescriptionLength = 280;

  struct LoadOptions
  {
    // Known output names for the per-output binding params (zones.sample,
    // frame.broadcast, output.send). Empty skips the unregistered-output
    // check (core has no output list of its own; the app passes its
    // Registry::outputNames()).
    std::unordered_set<std::string> knownOutputs{};
  };

  struct LoadIssue
  {
    std::string node;    // offending node id, empty when not tied to one
    std::string message;
    std::string code;    // stable machine-readable class, e.g. "port_unknown_input"
    std::string port;    // port named by the problem, empty when none
    std::string param;   // param named by the problem, empty when none
    std::vector<std::string> options; // valid choices or nearest matches, empty when none
  };

  struct LoadResult
  {
    bool ok = false;
    std::string error;             // set when !ok: the first issue's message
    std::vector<LoadIssue> issues; // every problem found, in document order
    Graph graph;                   // valid only when ok
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
      result.issues.push_back(LoadIssue{"", result.error, "json_invalid", "", "", {}});
      return result;
    }
  }
}
