#pragma once

#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Runtime/Graph/GraphTypes.hpp>
#include <Aurora/Runtime/Graph/GraphValue.hpp>

// The node contract (G1, Aurora-ra4o.2). Stateful nodes own their state
// struct; the evaluator owns the instance, keyed by stable node id, so
// state survives both ticks and graph swaps (adoptStateFrom).
namespace Aurora::Runtime::Graph
{
  struct EvalContext
  {
    std::string nodeId; // stable id from graph.json, for error values
    // Declared inputs only: required inputs always have an edge (load
    // guarantee); unconnected optional inputs arrive as Absent.
    std::unordered_map<std::string, GraphValue> inputs;
    // This node's params from the graph (defaults filled by the loader).
    std::unordered_map<std::string, ParamValue> params;
  };

  class INode
  {
  public:
    virtual ~INode() = default;

    virtual const std::vector<PortDecl>& inputPorts() const = 0;
    virtual const std::vector<PortDecl>& outputPorts() const = 0;

    // Reads ctx, writes every declared output port. May throw: the
    // evaluator converts that into a GraphError, never a crash. Called
    // unless an input carries an error or a required input is Absent;
    // Absent on an optional input arrives in ctx for the node to handle.
    virtual void evaluate(
      const EvalContext& ctx,
      float dt,
      std::unordered_map<std::string, GraphValue>& outputs) = 0;

    // Post-evaluate self-heal contract (Aurora-5y0): one bad tick (NaN
    // through fmod/state) must not poison the state struct for the rest
    // of the session. The evaluator calls checkStateInvariants() after
    // every evaluate(); on false it calls resetState() (cold-start
    // state) and keeps the tick's outputs. Default: stateless, always
    // healthy.
    virtual bool checkStateInvariants() const { return true; }
    virtual void resetState() {}

    // Reserved for later sequences, declared now so the shape is stable:
    // async variant returning the latest result plus its age, and a
    // per-node sampling width replacing the global subsampleWidth.
    // Not implemented in G1.
    virtual bool supportsAsync() const { return false; }
    virtual std::optional<int> samplingWidthOverride() const { return std::nullopt; }
  };
}
