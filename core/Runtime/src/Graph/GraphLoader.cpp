#include <Aurora/Runtime/Graph/GraphLoader.hpp>

#include <algorithm>
#include <cmath>
#include <sstream>
#include <unordered_map>

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

    // Candidates ranked by edit distance to `name` (ties keep input order),
    // cut to `limit` when non-zero.
    std::vector<std::string> nearest(
      const std::string& name,
      std::vector<std::string> candidates,
      std::size_t limit)
    {
      auto distance = [&](const std::string& other){
        std::vector<std::size_t> row(other.size() + 1);
        for(std::size_t j = 0; j <= other.size(); j++){
          row[j] = j;
        }
        for(std::size_t i = 1; i <= name.size(); i++){
          std::size_t diagonal = row[0];
          row[0] = i;
          for(std::size_t j = 1; j <= other.size(); j++){
            std::size_t above = row[j];
            row[j] = std::min({row[j] + 1, row[j - 1] + 1, diagonal + (name[i - 1] == other[j - 1] ? 0 : 1)});
            diagonal = above;
          }
        }
        return row[other.size()];
      };
      std::stable_sort(candidates.begin(), candidates.end(),
        [&](const std::string& a, const std::string& b){ return distance(a) < distance(b); });
      if(limit > 0 && candidates.size() > limit){
        candidates.resize(limit);
      }
      return candidates;
    }

    std::vector<std::string> portNames(const std::vector<PortDecl>& ports)
    {
      std::vector<std::string> names;
      for(const auto& port : ports){
        names.push_back(port.name);
      }
      return names;
    }

    std::vector<std::string> paramNames(const std::vector<ParamDecl>& params)
    {
      std::vector<std::string> names;
      for(const auto& param : params){
        names.push_back(param.name);
      }
      return names;
    }

    // Same rule as sanitizeParam: non-finite resets to the default, values
    // below min become unset (-1) when allowed, otherwise clamp to the range.
    float clampToSchema(const Contracts::ParamSchema& schema, float value)
    {
      if(!std::isfinite(value)){
        return schema.defaultValue;
      }
      if(schema.allowsUnset && value < schema.min){
        return -1.f;
      }
      return std::clamp(value, schema.min, schema.max);
    }

    // Validates one JSON param value against its declaration, filling the
    // default when the key is absent. Errors name node, param and the
    // expectation.
    bool parseParamValue(
      const std::string& nodeId,
      const ParamDecl& decl,
      const nlohmann::json* raw, // nullptr when absent
      ParamValue& out,
      LoadIssue& issueOut)
    {
      auto fail = [&](const std::string& expectation){
        std::ostringstream message;
        message << "node '" << nodeId << "': param '" << decl.name << "' " << expectation
                << " (expected " << paramKindName(decl.kind) << ")";
        issueOut = LoadIssue{nodeId, message.str(), "param_invalid", "", decl.name, {}};
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
          out = clampToSchema(decl.schema, raw->get<float>());
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
            fail(expectation.str());
            issueOut.code = "param_option_unknown";
            issueOut.options = decl.enumOptions;
            return false;
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
          out = std::optional<float>{clampToSchema(decl.schema, raw->get<float>())};
          return true;
        }
        case ParamKind::Gradient:{
          if(raw == nullptr){
            out = decl.defaultGradient;
            return true;
          }
          const std::string shape =
            "must be an array of 2 to 16 {\"pos\": 0..1, \"color\": \"#rrggbb\"} stops in ascending pos";
          if(!raw->is_array() || raw->size() < 2 || raw->size() > kMaxGradientStops){
            return fail(shape);
          }
          Gradient gradient;
          for(const auto& stop : *raw){
            if(!stop.is_object()){
              return fail(shape);
            }
            auto pos = stop.find("pos");
            auto color = stop.find("color");
            if(pos == stop.end() || color == stop.end() || !pos->is_number() || !color->is_string()){
              return fail(shape);
            }
            float position = pos->get<float>();
            std::optional<Contracts::Color> parsed = parseHexColor(color->get<std::string>());
            if(!std::isfinite(position) || position < 0.f || position > 1.f || !parsed ||
               (!gradient.stops.empty() && position < gradient.stops.back().position)){
              return fail(shape);
            }
            gradient.stops.push_back({position, *parsed});
          }
          out = std::move(gradient);
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
    // Collects every problem found. `node` is the offending node id, empty
    // when the problem is not tied to one.
    auto report = [&](
      const std::string& node,
      const std::string& code,
      const std::string& message,
      const std::string& port = "",
      const std::string& param = "",
      std::vector<std::string> options = {}){
      result.issues.push_back(LoadIssue{node, message, code, port, param, std::move(options)});
    };
    auto finish = [&]() -> LoadResult {
      result.error = result.issues.front().message;
      result.graph = Graph{};
      return std::move(result);
    };
    auto fail = [&](const std::string& code, const std::string& message) -> LoadResult {
      report("", code, message);
      return finish();
    };

    if(!doc.is_object()){
      return fail("graph_not_object", "graph must be a JSON object with 'version', 'nodes' and 'edges'");
    }

    auto versionIt = doc.find("version");
    if(versionIt == doc.end()){
      return fail("version_missing", "top-level 'version' is required (expected 1)");
    }
    if(!versionIt->is_number_integer() && !versionIt->is_number_unsigned()){
      return fail("version_invalid", "top-level 'version' must be the integer 1");
    }
    if(versionIt->get<int>() != 1){
      std::ostringstream message;
      message << "unsupported graph version " << versionIt->get<int>() << " (expected 1)";
      return fail("version_unsupported", message.str());
    }

    // Additive metadata (minorVersion 1): readers accept any minor and ignore unknown ones.
    auto minorIt = doc.find("minorVersion");
    if(minorIt != doc.end() && (!minorIt->is_number_integer() || minorIt->get<long long>() < 0)){
      report("", "minor_version_invalid", "top-level 'minorVersion' must be a non-negative integer when present");
    }
    for(const auto& [key, limit] : {std::pair<const char*, std::size_t>{"title", kMaxTitleLength},
                                    std::pair<const char*, std::size_t>{"description", kMaxDescriptionLength}}){
      auto textIt = doc.find(key);
      if(textIt == doc.end()){
        continue;
      }
      if(!textIt->is_string() || textIt->get<std::string>().empty() || textIt->get<std::string>().size() > limit){
        report("", std::string(key) + "_invalid", "top-level '" + std::string(key) +
          "' must be a non-empty string of at most " + std::to_string(limit) + " bytes when present");
      }
    }

    Graph graph;

    auto tickIt = doc.find("tickHz");
    if(tickIt != doc.end()){
      if(!tickIt->is_number() || !std::isfinite(tickIt->get<double>()) ||
         tickIt->get<double>() <= 0.0){
        report("", "tickhz_invalid", "top-level 'tickHz' must be a positive number when present "
                   "(absent means the app rate; the built-in Audio graph declares 60)");
      } else{
        graph.setTickHz(tickIt->get<double>());
      }
    }

    auto nodesIt = doc.find("nodes");
    if(nodesIt == doc.end() || !nodesIt->is_array()){
      return fail("nodes_invalid", "top-level 'nodes' must be an array of {id, type, params}");
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
    // Ids whose own problems are already reported: later checks skip them
    // instead of piling follow-on errors onto the same node.
    std::unordered_set<std::string> badIds;

    for(std::size_t i = 0; i < nodesIt->size(); i++){
      const auto& raw = (*nodesIt)[i];
      std::ostringstream where;
      where << "nodes[" << i << "]";
      if(!raw.is_object()){
        report("", "node_not_object", where.str() + " must be an object with 'id' and 'type'");
        continue;
      }
      auto idIt = raw.find("id");
      if(idIt == raw.end() || !idIt->is_string() || idIt->get<std::string>().empty()){
        report("", "node_id_invalid", where.str() + " needs a non-empty string 'id' (stable: state survives edits by id)");
        continue;
      }
      std::string id = idIt->get<std::string>();
      if(indexById.find(id) != indexById.end() || badIds.find(id) != badIds.end()){
        report(id, "node_id_duplicate", "duplicate node id '" + id + "' (node ids are stable and must be unique)");
        continue;
      }
      auto typeIt = raw.find("type");
      if(typeIt == raw.end() || !typeIt->is_string()){
        report(id, "node_type_missing", "node '" + id + "': missing string 'type'");
        badIds.insert(id);
        continue;
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
        report(id, "node_type_unknown", message.str(), "", "", nearest(type, registry.types(), 5));
        badIds.insert(id);
        continue;
      }

      bool nodeOk = true;
      auto paramsIt = raw.find("params");
      if(paramsIt != raw.end() && !paramsIt->is_object()){
        report(id, "params_not_object", "node '" + id + "': 'params' must be an object when present");
        badIds.insert(id);
        continue;
      }
      std::unordered_map<std::string, ParamValue> params;
      if(paramsIt != raw.end()){
        for(auto paramIt = paramsIt->begin(); paramIt != paramsIt->end(); ++paramIt){
          if(findParam(info->params, paramIt.key()) == nullptr){
            report(id, "param_unknown",
              "node '" + id + "': unknown param '" + paramIt.key() +
              "' (expected a param declared by type '" + type + "')",
              "", paramIt.key(), nearest(paramIt.key(), paramNames(info->params), 0));
            nodeOk = false;
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
        LoadIssue error;
        if(!parseParamValue(id, decl, rawValue, value, error)){
          result.issues.push_back(std::move(error));
          nodeOk = false;
          continue;
        }
        params.emplace(decl.name, std::move(value));
      }
      if(!nodeOk){
        badIds.insert(id);
        continue;
      }

      // Per-output binding params named "output" name a live output: check
      // against the app's outputs when it provided them.
      if(!options.knownOutputs.empty()){
        for(const ParamDecl& decl : info->params){
          if(decl.name == "output" && decl.kind == ParamKind::Enum){
            const std::string& binding = std::get<std::string>(params.at("output"));
            if(!binding.empty() && options.knownOutputs.find(binding) == options.knownOutputs.end()){
              report(id, "output_unregistered",
                "node '" + id + "': unregistered output '" + binding +
                "' (expected an output the app registered)",
                "", decl.name,
                nearest(binding,
                  std::vector<std::string>(options.knownOutputs.begin(), options.knownOutputs.end()), 0));
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
        report("", "edges_invalid", "top-level 'edges' must be an array of [\"node.port\", \"node.port\"] (output first)");
      } else{
        // toNode -> toPort -> edge index, for the one-edge-per-input rule.
        std::unordered_map<std::string, std::unordered_map<std::string, std::size_t>> seenInput;
        for(std::size_t i = 0; i < edgesIt->size(); i++){
          const auto& raw = (*edgesIt)[i];
          std::ostringstream where;
          where << "edges[" << i << "]";
          if(!raw.is_array() || raw.size() != 2 || !raw[0].is_string() || !raw[1].is_string()){
            report("", "edge_malformed", where.str() + " must be [\"node.port\", \"node.port\"] (output first)");
            continue;
          }
          std::string fromNode, fromPort, toNode, toPort;
          if(!splitEndpoint(raw[0].get<std::string>(), fromNode, fromPort)){
            report("", "edge_endpoint_malformed",
              where.str() + " source '" + raw[0].get<std::string>() +
              "' must be \"node.port\" naming a declared output port");
            continue;
          }
          if(!splitEndpoint(raw[1].get<std::string>(), toNode, toPort)){
            report("", "edge_endpoint_malformed",
              where.str() + " target '" + raw[1].get<std::string>() +
              "' must be \"node.port\" naming a declared input port");
            continue;
          }
          if(badIds.count(fromNode) > 0 || badIds.count(toNode) > 0){
            continue;
          }
          auto fromIt = indexById.find(fromNode);
          auto toIt = indexById.find(toNode);
          if(fromIt == indexById.end()){
            report(toIt != indexById.end() ? toNode : "", "edge_node_missing",
              where.str() + " source node '" + fromNode + "' does not exist");
            continue;
          }
          if(toIt == indexById.end()){
            report(fromNode, "edge_node_missing", where.str() + " target node '" + toNode + "' does not exist");
            continue;
          }
          const PendingNode& from = pending[fromIt->second];
          const PendingNode& to = pending[toIt->second];
          const PortDecl* out = findPort(from.info->outputs, fromPort);
          if(out == nullptr){
            report(fromNode, "port_unknown_output",
              where.str() + ": node '" + fromNode + "' (type '" + from.type +
              "') has no output port '" + fromPort + "'",
              fromPort, "", nearest(fromPort, portNames(from.info->outputs), 0));
            continue;
          }
          const PortDecl* in = findPort(to.info->inputs, toPort);
          if(in == nullptr){
            report(toNode, "port_unknown_input",
              where.str() + ": node '" + toNode + "' (type '" + to.type +
              "') has no input port '" + toPort + "'",
              toPort, "", nearest(toPort, portNames(to.info->inputs), 0));
            continue;
          }
          if(out->type != in->type){
            std::ostringstream message;
            message << where.str() << ": port-type mismatch: '" << fromNode << "." << fromPort
                    << "' carries " << portTypeName(out->type) << " but '" << toNode << "." << toPort
                    << "' expects " << portTypeName(in->type) << ")";
            report(toNode, "port_type_mismatch", message.str(), toPort);
            continue;
          }
          if(seenInput[toNode].find(toPort) != seenInput[toNode].end()){
            std::ostringstream message;
            message << where.str() << ": more than one edge into '" << toNode << "." << toPort
                    << "' (one edge per input; fan two sources through a pick-or-mix node first"
                    << (to.info->sinkBindingParam.has_value() ? "; this input feeds one output's send" : "")
                    << ")";
            report(toNode, "input_multiple_edges", message.str(), toPort);
            continue;
          }
          seenInput[toNode][toPort] = i;
          edges.push_back(GraphEdge{fromNode, fromPort, toNode, toPort});
        }
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
          report(node.id, "input_missing", message.str(), input.name);
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
        report(node.id, "output_multiple_senders",
          "more than one edge into output '" + *binding + "'s send: nodes '" + sinkIt->second +
          "' and '" + node.id +
          "' both send to it (expected one sender per output; combine sources with a pick-or-mix node first)");
        continue;
      }
      sinkByOutput.emplace(*binding, node.id);
    }

    // `controls` ("Show in Tuning") is frozen in the format though no
    // editor reads it in Sequence A: validate its shape and references.
    auto controlsIt = doc.find("controls");
    if(controlsIt != doc.end()){
      if(!controlsIt->is_array()){
        report("", "controls_invalid", "top-level 'controls' must be an array of {node, param, ...} when present");
      } else{
        for(std::size_t i = 0; i < controlsIt->size(); i++){
          const auto& raw = (*controlsIt)[i];
          std::ostringstream where;
          where << "controls[" << i << "]";
          if(!raw.is_object()){
            report("", "control_malformed", where.str() + " must be an object with 'node' and 'param'");
            continue;
          }
          auto nodeIt = raw.find("node");
          auto paramIt = raw.find("param");
          if(nodeIt == raw.end() || !nodeIt->is_string() || paramIt == raw.end() ||
             !paramIt->is_string()){
            report("", "control_malformed", where.str() + " needs string 'node' and 'param'");
            continue;
          }
          const std::string nodeId = nodeIt->get<std::string>();
          if(badIds.count(nodeId) > 0){
            continue;
          }
          auto nodeIdx = indexById.find(nodeId);
          if(nodeIdx == indexById.end()){
            std::vector<std::string> ids;
            for(const auto& candidate : pending){
              ids.push_back(candidate.id);
            }
            report("", "control_node_unknown", where.str() + " names unknown node '" + nodeId + "'",
              "", "", nearest(nodeId, ids, 5));
            continue;
          }
          const PendingNode& node = pending[nodeIdx->second];
          if(findParam(node.info->params, paramIt->get<std::string>()) == nullptr){
            report(node.id, "control_param_unknown",
              where.str() + ": node '" + node.id + "' (type '" + node.type + "') has no param '" +
              paramIt->get<std::string>() + "'",
              "", paramIt->get<std::string>(),
              nearest(paramIt->get<std::string>(), paramNames(node.info->params), 0));
          }
        }
      }
    }
    // `ui` is editor-only layout; core ignores it.

    if(!result.issues.empty()){
      return finish();
    }

    // Instantiate. A node whose code disagrees with its registry entry is
    // a node bug: fail the load rather than evaluating blind.
    for(auto& node : pending){
      std::unique_ptr<INode> instance;
      try{
        instance = node.info->factory();
      } catch(const std::exception& e){
        report(node.id, "node_construct_failed",
          "node '" + node.id + "': constructing type '" + node.type +
          "' threw: " + e.what());
        continue;
      }
      if(instance == nullptr){
        report(node.id, "node_construct_failed",
          "node '" + node.id + "': constructing type '" + node.type + "' returned null");
        continue;
      }
      std::string mismatch;
      if(!portsMatch(node.info->inputs, instance->inputPorts(), mismatch)){
        report(node.id, "node_port_mismatch", "node '" + node.id + "': " + mismatch + " on an input of type '" + node.type + "'");
        continue;
      }
      if(!portsMatch(node.info->outputs, instance->outputPorts(), mismatch)){
        report(node.id, "node_port_mismatch", "node '" + node.id + "': " + mismatch + " on an output of type '" + node.type + "'");
        continue;
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
    if(!result.issues.empty()){
      return finish();
    }
    for(auto& edge : edges){
      graph.addEdge(std::move(edge));
    }

    // finalize() rejects cycles, naming the nodes so an agent can break the loop.
    {
      std::string error;
      std::vector<std::string> cycleNodes;
      if(!graph.finalize(error, &cycleNodes)){
        for(const std::string& node : cycleNodes){
          report(node, "graph_cycle", error);
        }
        if(result.issues.empty()){
          report("", "graph_cycle", error);
        }
        return finish();
      }
    }

    result.ok = true;
    result.graph = std::move(graph);
    return result;
  }
}
