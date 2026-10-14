#include <Aurora/Runtime/Graph/Graph.hpp>

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
  }

  bool Graph::finalize(std::string& errorOut)
  {
    m_edgeByInput.clear();
    for(const auto& edge : m_edges){
      m_edgeByInput[edge.toNode][edge.toPort] = &edge;
    }

    // Kahn's algorithm over node ids.
    std::unordered_map<std::string, std::size_t> indegree;
    std::unordered_map<std::string, std::vector<std::string>> downstream;
    for(const auto& [id, _] : m_nodes){
      indegree[id] = 0;
    }
    for(const auto& edge : m_edges){
      downstream[edge.fromNode].push_back(edge.toNode);
      indegree[edge.toNode]++;
    }
    std::queue<std::string> ready;
    for(const auto& [id, degree] : indegree){
      if(degree == 0){
        ready.push(id);
      }
    }
    m_evalOrder.clear();
    while(!ready.empty()){
      std::string id = std::move(ready.front());
      ready.pop();
      m_evalOrder.push_back(id);
      for(const auto& next : downstream[id]){
        if(--indegree[next] == 0){
          ready.push(next);
        }
      }
    }
    if(m_evalOrder.size() != m_nodes.size()){
      std::ostringstream message;
      message << "cycle detected: no topo order over " << m_nodes.size() << " nodes (";
      bool first = true;
      for(const auto& [id, degree] : indegree){
        if(degree > 0){
          if(!first){
            message << ", ";
          }
          first = false;
          message << "node '" << id << "'";
        }
      }
      message << " never became ready; an agent must break the loop with a buffer or reorder node)";
      errorOut = message.str();
      m_evalOrder.clear();
      return false;
    }
    return true;
  }

  void Graph::tick(float dt)
  {
    for(const std::string& id : m_evalOrder){
      NodeInstance& instance = m_nodes.at(id);

      EvalContext ctx;
      ctx.nodeId = id;
      ctx.params = instance.params;

      // Gather inputs. An error on any input, or Absent on a required
      // input, propagates without calling evaluate. Absent on an
      // optional input flows into the context and the node decides.
      const GraphError* incomingError = nullptr;
      bool requiredAbsent = false;
      const auto edgeIt = m_edgeByInput.find(id);
      for(const PortDecl& input : instance.inputs){
        const GraphValue* value = nullptr;
        if(edgeIt != m_edgeByInput.end()){
          auto portIt = edgeIt->second.find(input.name);
          if(portIt != edgeIt->second.end()){
            const GraphEdge& edge = *portIt->second;
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
        ctx.inputs.emplace(input.name, std::move(current));
        const GraphValue& stored = ctx.inputs.at(input.name);
        if(const GraphError* err = asError(stored)){
          incomingError = err;
        } else if(isAbsent(stored) && input.required){
          requiredAbsent = true;
        }
      }

      std::unordered_map<std::string, GraphValue> produced;
      if(incomingError != nullptr){
        // NaN-style poisoning with the originating node id attached.
        for(const PortDecl& output : instance.outputs){
          produced.emplace(output.name, *incomingError);
        }
      } else if(requiredAbsent){
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
