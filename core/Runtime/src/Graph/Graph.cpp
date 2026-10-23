#include <Aurora/Runtime/Graph/Graph.hpp>

#include <functional>
#include <queue>
#include <sstream>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    std::string key(const std::string& nodeId, const std::string& port)
    {
      return nodeId + "." + port;
    }

    // Event-like ports are not held: a repeated buffer or onset would be
    // counted twice.
    bool holdsOnAbsent(PortType type)
    {
      return type != PortType::Trigger && type != PortType::AudioBuffer && type != PortType::AudioFeatures;
    }
  }

  Graph::NodeInstance* Graph::findNode(const std::string& id)
  {
    auto it = m_nodes.find(id);
    return it != m_nodes.end() ? &it->second : nullptr;
  }

  const Graph::NodeInstance* Graph::findNode(const std::string& id) const
  {
    auto it = m_nodes.find(id);
    return it != m_nodes.end() ? &it->second : nullptr;
  }

  bool Graph::hasNode(const std::string& id) const
  {
    return m_nodes.find(id) != m_nodes.end();
  }

  const GraphValue* Graph::portValue(const std::string& nodeId, const std::string& port) const
  {
    auto it = m_values.find(key(nodeId, port));
    return it != m_values.end() ? &it->second : nullptr;
  }

  void Graph::adoptStateFrom(Graph& prev)
  {
    if(&prev == this){
      return;
    }
    for(auto& [id, instance] : m_nodes){
      auto it = prev.m_nodes.find(id);
      if(it != prev.m_nodes.end() && it->second.type == instance.type && it->second.node &&
         instance.node){
        instance.node = std::move(it->second.node);
      }
    }
    // Held inputs carry over where the same source still feeds the same
    // input, so an in-place swap does not drop to Absent for a tick.
    for(auto& [inputKey, held] : prev.m_heldInputs){
      const auto dot = inputKey.rfind('.');
      const auto edgeIt = m_edgeByInput.find(inputKey.substr(0, dot));
      if(edgeIt == m_edgeByInput.end()){
        continue;
      }
      const auto portIt = edgeIt->second.find(inputKey.substr(dot + 1));
      if(portIt != edgeIt->second.end() && key(portIt->second->fromNode, portIt->second->fromPort) == held.source){
        m_heldInputs[inputKey] = std::move(held);
      }
    }
  }

  bool Graph::finalize(std::string& errorOut, std::vector<std::string>* cycleNodesOut)
  {
    m_edgeByInput.clear();
    for(const auto& edge : m_edges){
      m_edgeByInput[edge.toNode][edge.toPort] = &edge;
    }

    // Kahn's algorithm over declaration indices; the min-heap picks the
    // earliest-declared ready node, so order never depends on hashing.
    std::unordered_map<std::string, std::size_t> indexOf;
    for(std::size_t i = 0; i < m_declOrder.size(); ++i){
      indexOf[m_declOrder[i]] = i;
    }
    std::vector<std::size_t> indegree(m_declOrder.size(), 0);
    std::vector<std::vector<std::size_t>> downstream(m_declOrder.size());
    for(const auto& edge : m_edges){
      const std::size_t from = indexOf.at(edge.fromNode);
      const std::size_t to = indexOf.at(edge.toNode);
      downstream[from].push_back(to);
      indegree[to]++;
    }
    std::priority_queue<std::size_t, std::vector<std::size_t>, std::greater<>> ready;
    for(std::size_t i = 0; i < indegree.size(); ++i){
      if(indegree[i] == 0){
        ready.push(i);
      }
    }
    m_evalOrder.clear();
    while(!ready.empty()){
      const std::size_t i = ready.top();
      ready.pop();
      m_evalOrder.push_back(m_declOrder[i]);
      for(const std::size_t next : downstream[i]){
        if(--indegree[next] == 0){
          ready.push(next);
        }
      }
    }
    if(m_evalOrder.size() != m_declOrder.size()){
      std::ostringstream message;
      message << "cycle detected involving";
      bool first = true;
      for(std::size_t i = 0; i < m_declOrder.size(); ++i){
        if(indegree[i] > 0){
          message << (first ? " " : ", ") << "node '" << m_declOrder[i] << "'";
          first = false;
          if(cycleNodesOut){
            cycleNodesOut->push_back(m_declOrder[i]);
          }
        }
      }
      message << " (expected a directed acyclic graph; remove an edge so no node depends on its own output)";
      errorOut = message.str();
      m_evalOrder.clear();
      return false;
    }
    return true;
  }

  void Graph::tick(float dt, IGraphHost* host)
  {
    for(const std::string& id : m_evalOrder){
      NodeInstance& instance = m_nodes.at(id);

      EvalContext ctx;
      ctx.nodeId = id;
      ctx.params = instance.params;
      ctx.host = host;

      // Gather inputs. An error on any input, or Absent on a required
      // input, propagates without calling evaluate. A wired optional
      // input holds its last value (below); an unwired one reads Absent
      // and the node decides.
      const GraphError* incomingError = nullptr;
      bool absentInput = false;
      const auto edgeIt = m_edgeByInput.find(id);
      for(const PortDecl& input : instance.inputs){
        const GraphValue* value = nullptr;
        const GraphEdge* wired = nullptr;
        if(edgeIt != m_edgeByInput.end()){
          auto portIt = edgeIt->second.find(input.name);
          if(portIt != edgeIt->second.end()){
            const GraphEdge& edge = *portIt->second;
            wired = &edge;
            auto valueIt = m_values.find(key(edge.fromNode, edge.fromPort));
            if(valueIt != m_values.end()){
              value = &valueIt->second;
            }
          }
        }
        // No edge (optional input without one; required inputs always
        // have an edge by load guarantee) reads as Absent. The error
        // check reads the stored copy: checking the local before moving
        // it would leave incomingError dangling on moved-from state.
        GraphValue current = (value != nullptr) ? *value : GraphValue{Absent{}};
        // A wired optional input holds its last value through Absent ticks
        // (audio arriving slower than the tick); never valued, it is Absent
        // like a required input, not the unconnected param default.
        if(!input.required && wired != nullptr && holdsOnAbsent(input.type)){
          const std::string inputKey = key(id, input.name);
          if(isAbsent(current)){
            auto heldIt = m_heldInputs.find(inputKey);
            if(heldIt != m_heldInputs.end()){
              current = heldIt->second.value;
            } else {
              absentInput = true;
            }
          } else if(asError(current) == nullptr){
            m_heldInputs[inputKey] = HeldInput{key(wired->fromNode, wired->fromPort), current};
          }
        }
        ctx.inputs.emplace(input.name, std::move(current));
        const GraphValue& stored = ctx.inputs.at(input.name);
        if(const GraphError* err = asError(stored)){
          incomingError = err;
        } else if(isAbsent(stored) && input.required){
          absentInput = true;
        }
      }

      std::unordered_map<std::string, GraphValue> produced;
      if(incomingError != nullptr){
        // NaN-style poisoning with the originating node id attached.
        for(const PortDecl& output : instance.outputs){
          produced.emplace(output.name, *incomingError);
        }
      } else if(absentInput){
        for(const PortDecl& output : instance.outputs){
          produced.emplace(output.name, Absent{});
        }
      } else {
        try{
          instance.node->evaluate(ctx, dt, produced);
        } catch(const std::exception& e){
          produced.clear();
          for(const PortDecl& output : instance.outputs){
            produced.emplace(
              output.name,
              GraphError{id, std::string("evaluate threw: ") + e.what()});
          }
        } catch(...){
          produced.clear();
          for(const PortDecl& output : instance.outputs){
            produced.emplace(output.name, GraphError{id, "evaluate threw an unknown exception"});
          }
        }
        // A node that forgets an output is a bug in the node, not the
        // graph: mark it loudly rather than leaving a stale value.
        for(const PortDecl& output : instance.outputs){
          if(produced.find(output.name) == produced.end()){
            produced.emplace(
              output.name,
              GraphError{
                id,
                "node '" + id + "' did not produce output '" + output.name +
                "' (expected " + portTypeName(output.type) + "); fix the node to write every declared output"});
          }
        }
        // Post-evaluate self-heal (Aurora-5y0): a state struct that went
        // non-finite resets to cold-start state instead of poisoning every
        // future tick. The tick's outputs stand.
        if(!instance.node->checkStateInvariants()){
          instance.node->resetState();
          m_selfHeals++;
          if(!instance.node->checkStateInvariants()){
            for(const PortDecl& output : instance.outputs){
              produced[output.name] = GraphError{
                id,
                "node '" + id +
                "' state still unhealthy after reset; outputs replaced with this error"};
            }
          }
        }
      }

      for(auto& [port, value] : produced){
        m_values[key(id, port)] = std::move(value);
      }
    }
    m_tickCount++;
  }
}
