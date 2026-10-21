#pragma once

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Runtime/Graph/GraphHost.hpp>
#include <Aurora/Runtime/Graph/GraphTypes.hpp>
#include <Aurora/Runtime/Graph/GraphValue.hpp>
#include <Aurora/Runtime/Graph/INode.hpp>

// The evaluated graph (G1, Aurora-ra4o.2): topo order fixed at load,
// evaluated per tick. Built only by the loader; ticked by the host.
//
// Swap semantics: the host loads the replacement into a fresh Graph and,
// on success, calls adoptStateFrom() on it so stateful nodes keep their
// state across the swap (matched by stable node id + type), then swaps it
// in between ticks under the PipelineHost lock. A failed load returns an
// error and never touches the running graph.
namespace Aurora::Runtime::Graph
{
  struct GraphEdge
  {
    std::string fromNode;
    std::string fromPort;
    std::string toNode;
    std::string toPort;
  };

  class Graph
  {
  public:
    Graph() = default;
    Graph(Graph&&) = default;
    Graph& operator=(Graph&&) = default;
    Graph(const Graph&) = delete;
    Graph& operator=(const Graph&) = delete;

    // One tick in topo order with nominal dt seconds. Never throws. `host`
    // reaches every node's EvalContext; I/O nodes fail without one.
    void tick(float dt, IGraphHost* host = nullptr);

    // Last tick's value, or nullptr when node/port is unknown or no tick
    // has run yet.
    const GraphValue* portValue(const std::string& nodeId, const std::string& port) const;

    // Moves node instances (with their state) from `prev` for every node
    // whose id AND type match. Nodes new to this graph keep their fresh
    // instances; params always come from this graph's own description via
    // the per-tick EvalContext, so an adopted instance immediately runs
    // with the new params.
    void adoptStateFrom(Graph& prev);

    bool hasNode(const std::string& id) const;
    std::size_t nodeCount() const { return m_nodes.size(); }
    const std::vector<std::string>& evalOrder() const { return m_evalOrder; }
    const std::vector<GraphEdge>& edges() const { return m_edges; }

    // G0 frozen format: optional top-level tickHz. Absent means the app
    // rate (refreshRate); the built-in Audio graph declares 60.
    std::optional<double> tickHz() const { return m_tickHz; }

    std::uint64_t tickCount() const { return m_tickCount; }
    // Post-evaluate self-heals since construction (Aurora-5y0 contract).
    std::uint64_t selfHeals() const { return m_selfHeals; }

    struct NodeInstance
    {
      std::string id;
      std::string type;
      std::unique_ptr<INode> node;
      std::vector<PortDecl> inputs;
      std::vector<PortDecl> outputs;
      std::unordered_map<std::string, ParamValue> params;
    };

    // Loader-only assembly (public so the loader can use it; not for
    // hosts). finalize() topo-sorts into m_evalOrder, breaking ties by
    // declaration order so every platform evaluates identically, and
    // returns false with errorOut naming the nodes on a cycle.
    void setTickHz(std::optional<double> tickHz) { m_tickHz = tickHz; }
    void addNode(NodeInstance instance)
    {
      m_declOrder.push_back(instance.id);
      m_nodes.emplace(instance.id, std::move(instance));
    }
    void addEdge(GraphEdge edge) { m_edges.push_back(std::move(edge)); }
    // cycleNodesOut, when given, lists the nodes a cycle blocks.
    bool finalize(std::string& errorOut, std::vector<std::string>* cycleNodesOut = nullptr);

  private:
    NodeInstance* findNode(const std::string& id);
    const NodeInstance* findNode(const std::string& id) const;

    std::unordered_map<std::string, NodeInstance> m_nodes;
    std::vector<std::string> m_declOrder; // node ids as declared in graph.json
    std::vector<GraphEdge> m_edges;
    // toNode -> per-input edge (at most one edge per input, load guarantee).
    std::unordered_map<std::string, std::unordered_map<std::string, const GraphEdge*>> m_edgeByInput;
    std::vector<std::string> m_evalOrder;
    std::optional<double> m_tickHz{};
    // "nodeId.port" -> last value.
    std::unordered_map<std::string, GraphValue> m_values;
    std::uint64_t m_tickCount{0};
    std::uint64_t m_selfHeals{0};
  };
}
