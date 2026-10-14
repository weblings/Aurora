#include <Aurora/Runtime/Graph/GraphLoader.hpp>

#include <cmath>
#include <queue>
#include <sstream>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    // Splits "node.port" into (node, port). Port names never contain a dot
    // (loader guarantee: declared port names are matched whole), so the
    // split is at the first dot and the port may contain none further...
    // keep it simple: first dot splits, empty halves rejected.
    bool splitEndpoint(const std::string& text, std::string& node, std::string& port)
    {
      auto dot = text.find('.');
      if(dot == std::string::npos || dot == 0 || dot + 1 >= text.size()){
        return false;
      }
      node = text.substr(0, dot);
      port = text.substr(dot + 1);
      return true;
    }

    const ParamDecl* findParam(
      const std::vector<ParamDecl>& params,
      const std::string& name)
    {
      for(const auto& param : params){
        if(param.name == name){
          return &param;
        }
      }
      return nullptr;
    }

    const PortDecl* findPort(
      const std::vector<PortDecl>& ports,
      const std::string& name)
    {
      for(const auto& port : ports){
        if(port.name == name){
          return &port;
        }
      }
      return nullptr;
    }

    bool portsMatch(
      const std::vector<PortDecl>& a,
      const std::vector<PortDecl>& b,
      std::string& errorOut)
    {
      if(a.size() != b.size()){
        errorOut = "port count differs from the registry declaration";
        return false;
      }
      for(std::size_t i = 0; i < a.size(); i++){
        if(a[i].name != b[i].name || a[i].type != b[i].type || a[i].required != b[i].required){
          errorOut = std::string("port '") + a[i].name + "' differs from the registry declaration";
          return false;
        }
      }
      return true;
    }

    // Validates one JSON param value against its declaration, filling the
    // default when the key is absent. Errors name node, param and the
    // expectation.
    bool parseParamValue(
      const std::string& nodeId,
      const ParamDecl& decl,
      const nlohmann::json* raw, // nullptr when absent
      ParamValue& out,
      std::string& errorOut)
    {
      auto fail = [&](const std::string& expectation){
        std::ostringstream message;
        message << "node '" << nodeId << "': param '" << decl.name << "' " << expectation
                << " (expected " << paramKindName(decl.kind) << ")";
        errorOut = message.str();
        return false;
      };
      switch(decl.kind){
        case ParamKind::Float:{
          if(raw == nullptr){
            out = decl.schema.defaultValue;
            return true;
          }
          if(!raw->is_number()){
            return fail("must be a number");
          }
          out = raw->get<float>();
          return true;
        }
        case ParamKind::Bool:{
          if(raw == nullptr){
            out = decl.defaultBool;
            return true;
          }
          if(!raw->is_boolean()){
            return fail("must be true or false");
          }
          out = raw->get<bool>();
          return true;
        }
        case ParamKind::Enum:{
          if(raw == nullptr){
            out = decl.defaultEnum;
            return true;
          }
          if(!raw->is_string()){
            return fail("must be a string");
          }
          std::string value = raw->get<std::string>();
          bool known = false;
          for(const auto& option : decl.enumOptions){
            if(option == value){
              known = true;
              break;
            }
          }
          // An "output"-binding enum has server-computed options (G0): an
          // empty option list means "any output name", checked against
          // knownOutputs below instead of here.
          if(!known && !(decl.name == "output" && decl.enumOptions.empty())){
            std::ostringstream expectation;
            expectation << "unknown option '" << value << "' (expected one of:";
            for(const auto& option : decl.enumOptions){
              expectation << " '" << option << "'";
            }
            expectation << ")";
            return fail(expectation.str());
          }
          out = std::move(value);
          return true;
        }
        case ParamKind::OptionalFloat:{
          if(raw == nullptr || raw->is_null()){
            out = std::optional<float>{};
            return true;
          }
          if(!raw->is_number()){
            return fail("must be a number or null (null means unset)");
          }
          out = std::optional<float>{raw->get<float>()};
          return true;
        }
      }
      return fail("has an unknown param kind");
    }
  }

  LoadResult loadGraph(
    const nlohmann::json& doc,
    const NodeRegistry& registry,
    const LoadOptions& options)
  {
    LoadResult result;
    auto fail = [&](const std::string& message) -> LoadResult {
      result.error = message;
      result.graph = Graph{};
      return std::move(result);
    };

    if(!doc.is_object()){
      return fail("graph must be a JSON object with 'version', 'nodes' and 'edges'");
    }

    auto versionIt = doc.find("version");
    if(versionIt == doc.end()){
      return fail("top-level 'version' is required (expected 1)");
    }
    if(!versionIt->is_number_integer() && !versionIt->is_number_unsigned()){
      return fail("top-level 'version' must be the integer 1");
    }
    if(versionIt->get<int>() != 1){
      std::ostringstream message;
      message << "unsupported graph version " << versionIt->get<int>() << " (expected 1)";
      return fail(message.str());
    }

    Graph graph;

    auto tickIt = doc.find("tickHz");
    if(tickIt != doc.end()){
      if(!tickIt->is_number() || !std::isfinite(tickIt->get<double>()) ||
         tickIt->get<double>() <= 0.0){
        return fail("top-level 'tickHz' must be a positive number when present "
                    "(absent means the app rate; the built-in Audio graph declares 60)");
      }
      graph.setTickHz(tickIt->get<double>());
    }

    auto nodesIt = doc.find("nodes");
    if(nodesIt == doc.end() || !nodesIt->is_array()){
      return fail("top-level 'nodes' must be an array of {id, type, params}");
    }

    struct PendingNode
    {
      std::string id;
      std::string type;
      const NodeTypeInfo* info = nullptr;
      std::unordered_map<std::string, ParamValue> params;
    };
    std::vector<PendingNode> pending;
    std::unordered_map<std::string, std::size_t> indexById;

    for(std::size_t i = 0; i < nodesIt->size(); i++){
      const auto& raw = (*nodesIt)[i];
      std::ostringstream where;
      where << "nodes[" << i << "]";
      if(!raw.is_object()){
        return fail(where.str() + " must be an object with 'id' and 'type'");
      }
      auto idIt = raw.find("id");
      if(idIt == raw.end() || !idIt->is_string() || idIt->get<std::string>().empty()){
        return fail(where.str() + " needs a non-empty string 'id' (stable: state survives edits by id)");
      }
      std::string id = idIt->get<std::string>();
      if(indexById.find(id) != indexById.end()){
        return fail("duplicate node id '" + id + "' (node ids are stable and must be unique)");
      }
      auto typeIt = raw.find("type");
      if(typeIt == raw.end() || !typeIt->is_string()){
        return fail("node '" + id + "': missing string 'type'");
      }
      std::string type = typeIt->get<std::string>();
      const NodeTypeInfo* info = registry.find(type);
      if(info == nullptr){
        std::ostringstream message;
        message << "node '" << id << "': unknown type '" << type << "' (expected a registered node type;";
        bool first = true;
        for(const auto& known : registry.types()){
          message << (first ? " " : ", ") << "'" << known << "'";
          first = false;
        }
        message << ")";
        return fail(message.str());
      }

      auto paramsIt = raw.find("params");
      if(paramsIt != raw.end() && !paramsIt->is_object()){
        return fail("node '" + id + "': 'params' must be an object when present");
      }
      std::unordered_map<std::string, ParamValue> params;
      if(paramsIt != raw.end()){
        for(auto paramIt = paramsIt->begin(); paramIt != paramsIt->end(); ++paramIt){
          if(findParam(info->params, paramIt.key()) == nullptr){
            return fail(
              "node '" + id + "': unknown param '" + paramIt.key() +
              "' (expected a param declared by type '" + type + "')");
          }
        }
      }
      for(const ParamDecl& decl : info->params){
        const nlohmann::json* rawValue = nullptr;
        if(paramsIt != raw.end()){
          auto it = paramsIt->find(decl.name);
          if(it != paramsIt->end()){
            rawValue = &(*it);
          }
        }
        ParamValue value{0.f};
        std::string error;
        if(!parseParamValue(id, decl, rawValue, value, error)){
          return fail(error);
        }
        params.emplace(decl.name, std::move(value));
      }

      // Per-output binding params named "output" name a live output: check
      // against the app's outputs when it provided them.
      if(!options.knownOutputs.empty()){
        for(const ParamDecl& decl : info->params){
          if(decl.name == "output" && decl.kind == ParamKind::Enum){
            const std::string& binding = std::get<std::string>(params.at("output"));
            if(!binding.empty() && options.knownOutputs.find(binding) == options.knownOutputs.end()){
              return fail(
                "node '" + id + "': unregistered output '" + binding +
                "' (expected an output the app registered)");
            }
          }
        }
      }

      indexById.emplace(id, pending.size());
      pending.push_back(PendingNode{id, std::move(type), info, std::move(params)});
    }

    auto edgesIt = doc.find("edges");
    std::vector<GraphEdge> edges;
    if(edgesIt != doc.end()){
      if(!edgesIt->is_array()){
        return fail("top-level 'edges' must be an array of [\"node.port\", \"node.port\"] (output first)");
      }
      // toNode -> toPort -> edge index, for the one-edge-per-input rule.
      std::unordered_map<std::string, std::unordered_map<std::string, std::size_t>> seenInput;
      for(std::size_t i = 0; i < edgesIt->size(); i++){
        const auto& raw = (*edgesIt)[i];
        std::ostringstream where;
        where << "edges[" << i << "]";
        if(!raw.is_array() || raw.size() != 2 || !raw[0].is_string() || !raw[1].is_string()){
          return fail(where.str() + " must be [\"node.port\", \"node.port\"] (output first)");
        }
        std::string fromNode, fromPort, toNode, toPort;
        if(!splitEndpoint(raw[0].get<std::string>(), fromNode, fromPort)){
          return fail(
            where.str() + " source '" + raw[0].get<std::string>() +
            "' must be \"node.port\" naming a declared output port");
        }
        if(!splitEndpoint(raw[1].get<std::string>(), toNode, toPort)){
          return fail(
            where.str() + " target '" + raw[1].get<std::string>() +
            "' must be \"node.port\" naming a declared input port");
        }
        auto fromIt = indexById.find(fromNode);
        if(fromIt == indexById.end()){
          return fail(where.str() + " source node '" + fromNode + "' does not exist");
        }
        auto toIt = indexById.find(toNode);
        if(toIt == indexById.end()){
          return fail(where.str() + " target node '" + toNode + "' does not exist");
        }
        const PendingNode& from = pending[fromIt->second];
        const PendingNode& to = pending[toIt->second];
        const PortDecl* out = findPort(from.info->outputs, fromPort);
        if(out == nullptr){
          return fail(
            where.str() + ": node '" + fromNode + "' (type '" + from.type +
            "') has no output port '" + fromPort + "'");
        }
        const PortDecl* in = findPort(to.info->inputs, toPort);
        if(in == nullptr){
          return fail(
            where.str() + ": node '" + toNode + "' (type '" + to.type +
            "') has no input port '" + toPort + "'");
        }
        if(out->type != in->type){
          std::ostringstream message;
          message << where.str() << ": port-type mismatch: '" << fromNode << "." << fromPort
                  << "' carries " << portTypeName(out->type) << " but '" << toNode << "." << toPort
                  << "' expects " << portTypeName(in->type) << ")";
          return fail(message.str());
        }
        if(seenInput[toNode].find(toPort) != seenInput[toNode].end()){
          std::ostringstream message;
          message << where.str() << ": more than one edge into '" << toNode << "." << toPort
                  << "' (one edge per input; fan two sources through a pick-or-mix node first"
                  << (to.info->sinkBindingParam.has_value() ? "; this input feeds one output's send" : "")
                  << ")";
          return fail(message.str());
        }
        seenInput[toNode][toPort] = i;
        edges.push_back(GraphEdge{fromNode, fromPort, toNode, toPort});
      }
    }

    // Every required input must be fed.
    std::unordered_map<std::string, std::unordered_set<std::string>> fedInputs;
    for(const auto& edge : edges){
      fedInputs[edge.toNode].insert(edge.toPort);
    }
    for(const auto& node : pending){
      for(const PortDecl& input : node.info->inputs){
        if(!input.required){
          continue;
        }
        auto fedIt = fedInputs.find(node.id);
        if(fedIt == fedInputs.end() || fedIt->second.find(input.name) == fedIt->second.end()){
          std::ostringstream message;
          message << "node '" << node.id << "': missing required input '" << input.name << "' (expected "
                  << portTypeName(input.type) << " from some node's output; connect an edge to it)";
          return fail(message.str());
        }
      }
    }

    // Two sinks on one output would flicker (Aurora-o13): a pick-or-mix
    // node is required instead.
    std::unordered_map<std::string, std::string> sinkByOutput;
    for(const auto& node : pending){
      if(!node.info->sinkBindingParam.has_value()){
        continue;
      }
      const std::string& paramName = *node.info->sinkBindingParam;
      auto paramIt = node.params.find(paramName);
      if(paramIt == node.params.end()){
        continue;
      }
      const std::string* binding = std::get_if<std::string>(&paramIt->second);
      if(binding == nullptr || binding->empty()){
        continue;
      }
      auto sinkIt = sinkByOutput.find(*binding);
      if(sinkIt != sinkByOutput.end()){
        return fail(
          "more than one edge into output '" + *binding + "'s send: nodes '" + sinkIt->second +
          "' and '" + node.id +
          "' both send to it (expected one sender per output; combine sources with a pick-or-mix node first)");
      }
      sinkByOutput.emplace(*binding, node.id);
    }

    // `controls` ("Show in Tuning") is frozen in the format though no
    // editor reads it in Sequence A: validate its shape and references.
    auto controlsIt = doc.find("controls");
    if(controlsIt != doc.end()){
      if(!controlsIt->is_array()){
        return fail("top-level 'controls' must be an array of {node, param, ...} when present");
      }
      for(std::size_t i = 0; i < controlsIt->size(); i++){
        const auto& raw = (*controlsIt)[i];
        std::ostringstream where;
        where << "controls[" << i << "]";
        if(!raw.is_object()){
          return fail(where.str() + " must be an object with 'node' and 'param'");
        }
        auto nodeIt = raw.find("node");
        auto paramIt = raw.find("param");
        if(nodeIt == raw.end() || !nodeIt->is_string() || paramIt == raw.end() ||
           !paramIt->is_string()){
          return fail(where.str() + " needs string 'node' and 'param'");
        }
        auto nodeIdx = indexById.find(nodeIt->get<std::string>());
        if(nodeIdx == indexById.end()){
          return fail(where.str() + " names unknown node '" + nodeIt->get<std::string>() + "'");
        }
        const PendingNode& node = pending[nodeIdx->second];
        if(findParam(node.info->params, paramIt->get<std::string>()) == nullptr){
          return fail(
            where.str() + ": node '" + node.id + "' (type '" + node.type + "') has no param '" +
            paramIt->get<std::string>() + "'");
        }
      }
    }
    // `ui` is editor-only layout; core ignores it.

    // Instantiate. A node whose code disagrees with its registry entry is
    // a node bug: fail the load rather than evaluating blind.
    for(auto& node : pending){
      std::unique_ptr<INode> instance;
      try{
        instance = node.info->factory();
      } catch(const std::exception& e){
        return fail(
          "node '" + node.id + "': constructing type '" + node.type +
          "' threw: " + e.what());
      }
      if(instance == nullptr){
        return fail(
          "node '" + node.id + "': constructing type '" + node.type + "' returned null");
      }
      std::string mismatch;
      if(!portsMatch(node.info->inputs, instance->inputPorts(), mismatch)){
        return fail("node '" + node.id + "': " + mismatch + " on an input of type '" + node.type + "'");
      }
      if(!portsMatch(node.info->outputs, instance->outputPorts(), mismatch)){
        return fail("node '" + node.id + "': " + mismatch + " on an output of type '" + node.type + "'");
      }
      Graph::NodeInstance assembled;
      assembled.id = node.id;
      assembled.type = node.type;
      assembled.node = std::move(instance);
      assembled.inputs = node.info->inputs;
      assembled.outputs = node.info->outputs;
      assembled.params = std::move(node.params);
      graph.addNode(std::move(assembled));
    }
    for(auto& edge : edges){
      graph.addEdge(std::move(edge));
    }

    // Cycle check with the nodes named, so an agent can break the loop.
    {
      std::unordered_map<std::string, std::size_t> indegree;
      std::unordered_map<std::string, std::vector<std::string>> downstream;
      for(const auto& node : pending){
        indegree[node.id] = 0;
      }
      for(const auto& edge : graph.edges()){
        downstream[edge.fromNode].push_back(edge.toNode);
        indegree[edge.toNode]++;
      }
      std::queue<std::string> ready;
      for(const auto& [id, degree] : indegree){
        if(degree == 0){
          ready.push(id);
        }
      }
      std::size_t visited = 0;
      while(!ready.empty()){
        std::string id = std::move(ready.front());
        ready.pop();
        visited++;
        for(const auto& next : downstream[id]){
          if(--indegree[next] == 0){
            ready.push(next);
          }
        }
      }
      if(visited != pending.size()){
        std::ostringstream message;
        message << "cycle detected involving";
        bool first = true;
        for(const auto& [id, degree] : indegree){
          if(degree > 0){
            message << (first ? " " : ", ") << "node '" << id << "'";
            first = false;
          }
        }
        message << " (expected a directed acyclic graph; break the loop with a buffer or reorder node)";
        return fail(message.str());
      }
    }

    {
      std::string error;
      if(!graph.finalize(error)){
        return fail(error);
      }
    }

    result.ok = true;
    result.graph = std::move(graph);
    return result;
  }
}
