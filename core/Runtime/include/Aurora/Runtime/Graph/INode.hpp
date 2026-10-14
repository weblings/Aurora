#pragma once

#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

#include <Aurora/Runtime/Graph/GraphHost.hpp>
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
    // Host services for I/O nodes; nullptr when the graph ticks without one.
    IGraphHost* host = nullptr;

    // Typed accessors (G1c). Each throws on a missing name or wrong type;
    // the evaluator turns the throw into a GraphError naming this node.
    template<class T>
    const T& param(const std::string& name) const
    {
      auto it = params.find(name);
      if(it == params.end()){
        fail("has no param '" + name + "'");
      }
      const T* value = std::get_if<T>(&it->second);
      if(value == nullptr){
        fail("param '" + name + "' has an unexpected kind");
      }
      return *value;
    }

    // A present value of type T. Use for required inputs (the evaluator
    // never calls evaluate with a required input Absent).
    template<class T>
    const T& input(const std::string& name) const
    {
      const T* value = optionalInput<T>(name);
      if(value == nullptr){
        fail("input '" + name + "' is Absent");
      }
      return *value;
    }

    // nullptr when the input is Absent (optional inputs only).
    template<class T>
    const T* optionalInput(const std::string& name) const
    {
      auto it = inputs.find(name);
      if(it == inputs.end()){
        fail("has no input '" + name + "'");
      }
      if(isAbsent(it->second)){
        return nullptr;
      }
      const T* value = std::get_if<T>(&it->second);
      if(value == nullptr){
        fail("input '" + name + "' carries an unexpected type");
      }
      return value;
    }

    IGraphHost& requireHost() const
    {
      if(host == nullptr){
        fail("needs host services but the graph ticked without a host");
      }
      return *host;
    }

    [[noreturn]] void fail(const std::string& what) const
    {
      throw std::runtime_error("node '" + nodeId + "' " + what);
    }
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
