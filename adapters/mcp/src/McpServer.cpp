#include "McpServer.hpp"

#include <cmath>
#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <stdexcept>
#include <utility>

namespace Aurora::Mcp
{
  namespace
  {
    constexpr std::array<const char*, 3> kProtocolVersions{"2025-06-18", "2025-03-26", "2024-11-05"};

    constexpr int kParseError = -32700;
    constexpr int kInvalidRequest = -32600;
    constexpr int kMethodNotFound = -32601;
    constexpr int kInvalidParams = -32602;

    // Thrown by method handlers, answered as a JSON-RPC error.
    struct RpcError : std::runtime_error
    {
      RpcError(int c, const std::string& message) : std::runtime_error(message), code(c) {}
      int code;
    };

    const char* kInstructions =
      "Aurora drives ambient lights from the screen or audio. Call aurora_status first "
      "to see whether Aurora is running, which effect is live, and what is connected. "
      "A graph can only use the inputs in configuredInputs: if it needs one that is null, "
      "ask the user to choose it in Aurora first. "
      "Start from a preset: list_presets, then get_preset, and change as little as you can. "
      "Use list_nodes and describe_node for the node types, params and ports you edit. "
      "Keep the preset's controls so the user can still tune the result in Aurora. "
      "In an audio graph, silence holds the last frame, so do not expect it to go dark. "
      "put_draft saves and validates the whole graph: fix every error before going on. "
      "set_control tunes one control. preview samples the draft off the lights, so use it before "
      "touching them. try_on_lights shows the draft on the real lights for the user to judge: "
      "ask them, then call keep to save it or revert. A test reverts by itself if this server stops. "
      "apply saves and activates a draft without a test, so ask the user first. "
      "revert_effect goes back to what ran before your first apply.";

    nlohmann::json errorResponse(const nlohmann::json& id, int code, const std::string& message)
    {
      return {{"jsonrpc", "2.0"}, {"id", id}, {"error", {{"code", code}, {"message", message}}}};
    }

    nlohmann::json toolText(const std::string& text, bool isError)
    {
      return {{"content", nlohmann::json::array({{{"type", "text"}, {"text", text}}})}, {"isError", isError}};
    }

    // structuredContent for clients that read it, with the same JSON as text for the rest.
    nlohmann::json toolJson(const nlohmann::json& value)
    {
      nlohmann::json result = toolText(value.dump(), false);
      result["structuredContent"] = value;
      return result;
    }

    nlohmann::json readOnlyTool(const char* name, const char* description, nlohmann::json properties = nlohmann::json::object(),
      nlohmann::json required = nlohmann::json::array())
    {
      nlohmann::json schema = {{"type", "object"}, {"properties", std::move(properties)}};
      if(!required.empty()){
        schema["required"] = std::move(required);
      }
      return {{"name", name}, {"description", description}, {"inputSchema", std::move(schema)},
        {"annotations", {{"readOnlyHint", true}}}};
    }

    nlohmann::json writeTool(const char* name, const char* description, nlohmann::json properties, nlohmann::json required)
    {
      nlohmann::json tool = readOnlyTool(name, description, std::move(properties), std::move(required));
      // Only the adapter's own draft changes, and saving twice is the same as once.
      tool["annotations"] = {{"readOnlyHint", false}, {"destructiveHint", false}, {"idempotentHint", true}};
      return tool;
    }

    // Changes what the lights show, so clients ask before running it.
    nlohmann::json lightsTool(const char* name, const char* description, nlohmann::json properties, nlohmann::json required)
    {
      nlohmann::json tool = readOnlyTool(name, description, std::move(properties), std::move(required));
      tool["annotations"] = {{"readOnlyHint", false}, {"destructiveHint", false}, {"idempotentHint", false}};
      return tool;
    }

    // Per-sample color step above which a graph counts as reacting.
    constexpr double kReactingChange = 0.001;

    // "name:Type", with a trailing "?" on an input the node can run without.
    std::string portLabel(const nlohmann::json& port)
    {
      return port.value("name", "") + ":" + port.value("type", "") + (port.value("required", true) ? "" : "?");
    }

    nlohmann::json portLabels(const nlohmann::json& ports)
    {
      nlohmann::json labels = nlohmann::json::array();
      for(const auto& port : ports){
        labels.push_back(portLabel(port));
      }
      return labels;
    }

    bool validPathSegment(const std::string& text)
    {
      return !text.empty() && std::all_of(text.begin(), text.end(), [](unsigned char c){
        return std::isalnum(c) || c == '_' || c == '-' || c == '.';
      });
    }

    nlohmann::json orNull(const nlohmann::json& object, const char* key)
    {
      return object.contains(key) ? object.at(key) : nlohmann::json(nullptr);
    }

    nlohmann::json nameOrNull(const nlohmann::json& object, const char* key)
    {
      const std::string name = object.value(key, "");
      return name.empty() ? nlohmann::json(nullptr) : nlohmann::json(name);
    }

    // Aurora only captures inputs the user chose, so retrying cannot help: the user must pick one.
    std::optional<std::string> missingInputMessage(const std::string& message)
    {
      if(message.find("input but none is configured") == std::string::npos){
        return std::nullopt;
      }
      return "The " + message + ". Aurora only captures inputs the user chose, so ask the user to choose "
        "one in Aurora, or build a graph without it. aurora_status shows configuredInputs.";
    }
  }


  McpServer::McpServer(Fetch fetch, std::string serverVersion, std::string session, Fetch beatFetch)
    : m_fetch(std::move(fetch)), m_beatFetch(beatFetch ? std::move(beatFetch) : m_fetch),
      m_serverVersion(std::move(serverVersion)), m_session(std::move(session))
  {}


  McpServer::~McpServer()
  {
    _stopBeat();
  }


  void McpServer::shutdown()
  {
    _stopBeat();
    if(m_testing){
      m_fetch("POST", "/api/graph/test/revert", nlohmann::json{{"session", m_session}}.dump());
      m_testing = false;
    }
    if(m_hasDraft){
      m_fetch("DELETE", "/api/graph/drafts/" + m_session, {});
      m_hasDraft = false;
    }
  }


  const char* McpServer::latestProtocolVersion()
  {
    return kProtocolVersions.front();
  }


  std::optional<std::string> McpServer::handleLine(const std::string& line)
  {
    nlohmann::json request;
    try{
      request = nlohmann::json::parse(line);
    }
    catch(const nlohmann::json::exception&){
      return errorResponse(nullptr, kParseError, "parse error").dump();
    }

    // Batches were dropped from the spec in 2025-06-18.
    if(!request.is_object() || request.value("jsonrpc", "") != "2.0"){
      return errorResponse(nullptr, kInvalidRequest, "invalid request").dump();
    }

    const bool hasId = request.contains("id");
    if(!request.contains("method")){
      // A response to a request we never send gets no answer.
      if(hasId && !request.contains("result") && !request.contains("error")){
        return errorResponse(request.at("id"), kInvalidRequest, "missing method").dump();
      }
      return std::nullopt;
    }
    if(!request.at("method").is_string()){
      return errorResponse(hasId ? request.at("id") : nlohmann::json(nullptr), kInvalidRequest, "method must be a string").dump();
    }
    if(!hasId){
      return std::nullopt;
    }
    if(!(request.at("id").is_string() || request.at("id").is_number_integer())){
      return errorResponse(nullptr, kInvalidRequest, "id must be a string or integer").dump();
    }

    const nlohmann::json& id = request.at("id");
    const std::string method = request.at("method").get<std::string>();
    const nlohmann::json params = request.contains("params") ? request.at("params") : nlohmann::json::object();

    try{
      nlohmann::json result;
      if(method == "initialize"){
        result = _initialize(params);
      }
      else if(method == "ping"){
        result = nlohmann::json::object();
      }
      else if(method == "tools/list"){
        result = _toolsList();
      }
      else if(method == "tools/call"){
        result = _toolsCall(params);
      }
      else{
        throw RpcError(kMethodNotFound, "method not found: " + method);
      }
      return nlohmann::json{{"jsonrpc", "2.0"}, {"id", id}, {"result", std::move(result)}}.dump();
    }
    catch(const RpcError& error){
      return errorResponse(id, error.code, error.what()).dump();
    }
  }


  nlohmann::json McpServer::_initialize(const nlohmann::json& params)
  {
    if(!params.is_object() || !params.contains("protocolVersion") || !params.at("protocolVersion").is_string()){
      throw RpcError(kInvalidParams, "protocolVersion is required");
    }

    // Echo the client's version when supported, else offer our latest.
    const std::string asked = params.at("protocolVersion").get<std::string>();
    const bool known = std::any_of(kProtocolVersions.begin(), kProtocolVersions.end(),
      [&asked](const char* version){ return asked == version; });

    return {
      {"protocolVersion", known ? asked : std::string(latestProtocolVersion())},
      {"capabilities", {{"tools", {{"listChanged", false}}}}},
      {"serverInfo", {{"name", "aurora"}, {"version", m_serverVersion}}},
      {"instructions", kInstructions}
    };
  }


  nlohmann::json McpServer::_toolsList() const
  {
    const nlohmann::json typeProperty = {{"type", {{"type", "string"}, {"description", "Node type, e.g. audio.bands."}}}};
    const nlohmann::json effectIdProperty = {{"id", {{"type", "string"},
      {"description", "Effect id to save as: letters, digits, dot, dash or underscore."}}}};
    const nlohmann::json idProperty = {{"id", {{"type", "string"}, {"description", "Preset id from list_presets."}}}};
    return {{"tools", nlohmann::json::array({
      readOnlyTool("aurora_status",
        "Read Aurora's live state: running or paused, the requested and running effect, "
        "whether a fallback effect is running, the running inputs, the inputs the user chose "
        "(configuredInputs, which graphs can use), the outputs, and any active light test."),
      readOnlyTool("list_nodes",
        "List the node types a graph can use: type, purpose, and ports as name:Type. A trailing ? marks "
        "an input that may stay unconnected. Use describe_node for params and usage.",
        {{"category", {{"type", "string"}, {"description", "Only types starting with this prefix, e.g. audio or math."}}}}),
      readOnlyTool("describe_node",
        "Full descriptor for one node type: purpose, when to use it, an example, cost, ports and every "
        "param with its range, unit, default and options.",
        typeProperty, nlohmann::json::array({"type"})),
      readOnlyTool("list_presets",
        "List starter graphs (video, audio, both, spatial) with the inputs each needs and its Tuning controls."),
      readOnlyTool("get_preset",
        "A starter graph already filled with this Aurora's outputs, validated, with Tuning controls. "
        "Edit it and save it as a draft.",
        idProperty, nlohmann::json::array({"id"})),
      writeTool("put_draft",
        "Save the whole graph as your draft and validate it. An invalid graph is a normal result: valid false "
        "with errors, each with code, node, port or param, and the valid options. Fix and save again. "
        "Nothing reaches the lights.",
        {{"graph", {{"type", "object"}, {"description", "Graph document: version, nodes, edges, controls."}}}},
        nlohmann::json::array({"graph"})),
      writeTool("set_control",
        "Change one control value on the draft without editing the graph. Name the control by its label or "
        "as node.param. Returns the draft's validation.",
        {{"control", {{"type", "string"}, {"description", "Control label or node.param."}}},
         {"value", {{"type", nlohmann::json::array({"number", "string", "boolean"})},
                    {"description", "New value, in the param's own type."}}}},
        nlohmann::json::array({"control", "value"})),
      readOnlyTool("preview",
        "Run the draft off the lights for a few seconds and summarise each output: mean color, brightness range "
        "and change per zone. reacting is false for a graph that holds still, true when its colors move.",
        {{"seconds", {{"type", "number"}, {"description", "Seconds to sample, default 3, capped by Aurora."}}}}),
      lightsTool("try_on_lights",
        "Show the draft on the real lights so the user can judge it. It keeps running while this server "
        "lives, up to about two minutes, and reverts by itself if the client dies. Then ask the user and "
        "call keep or revert.",
        nlohmann::json::object(), nlohmann::json::array()),
      lightsTool("keep",
        "Save the tested draft under this effect id and make it the live effect. Call after the user approves "
        "a try_on_lights test. Fails if the draft changed since the test started.",
        effectIdProperty, nlohmann::json::array({"id"})),
      lightsTool("revert",
        "End the light test now and restore the previous lights.",
        nlohmann::json::object(), nlohmann::json::array()),
      lightsTool("apply",
        "Save the draft under this effect id and make it live without a light test. Prefer try_on_lights "
        "and keep. A result with isError true means Aurora fell back to a built-in effect.",
        effectIdProperty, nlohmann::json::array({"id"})),
      lightsTool("revert_effect",
        "Switch back to the effect that was live before your first apply in this session.",
        nlohmann::json::object(), nlohmann::json::array())
    })}};
  }


  nlohmann::json McpServer::_toolsCall(const nlohmann::json& params)
  {
    if(!params.is_object() || !params.contains("name") || !params.at("name").is_string()){
      throw RpcError(kInvalidParams, "name is required");
    }
    const std::string name = params.at("name").get<std::string>();
    const nlohmann::json arguments = params.contains("arguments") && params.at("arguments").is_object()
      ? params.at("arguments") : nlohmann::json::object();

    if(name == "aurora_status"){
      return _auroraStatus();
    }
    if(name == "list_nodes"){
      return _listNodes(arguments);
    }
    if(name == "describe_node"){
      return _describeNode(arguments);
    }
    if(name == "list_presets"){
      return _listPresets();
    }
    if(name == "get_preset"){
      return _getPreset(arguments);
    }
    if(name == "put_draft"){
      return _putDraft(arguments);
    }
    if(name == "set_control"){
      return _setControl(arguments);
    }
    if(name == "preview"){
      return _preview(arguments);
    }
    if(name == "try_on_lights"){
      return _tryOnLights();
    }
    if(name == "keep"){
      return _keep(arguments);
    }
    if(name == "revert"){
      return _revert();
    }
    if(name == "apply"){
      return _apply(arguments);
    }
    if(name == "revert_effect"){
      return _revertEffect();
    }
    throw RpcError(kInvalidParams, "unknown tool: " + name);
  }


  std::string McpServer::_getJson(const std::string& path, nlohmann::json& out, int* status)
  {
    return _requestJson("GET", path, {}, out, status);
  }


  std::string McpServer::_requestJson(const std::string& method, const std::string& path, const std::string& body,
    nlohmann::json& out, int* status)
  {
    // Failures are tool results (isError), so the agent can read and act on them.
    const HttpReply reply = m_fetch(method, path, body);
    if(status){
      *status = reply.status;
    }
    if(reply.status == 0){
      return "Aurora is not reachable (" + reply.error + "). Start Aurora and check AURORA_URL.";
    }
    if(reply.status == 401 || reply.status == 403){
      return "Aurora refused the request (HTTP " + std::to_string(reply.status) + "). Set AURORA_TOKEN to a paired token.";
    }
    // An error body still tells the caller why, so it is kept in `out` when it parses.
    try{
      out = nlohmann::json::parse(reply.body);
    }
    catch(const nlohmann::json::exception&){
      out = nlohmann::json();
    }
    if(reply.status != 200){
      if(!out.is_object()){
        out = nlohmann::json::object();
      }
      return method + " " + path + " answered HTTP " + std::to_string(reply.status) + ".";
    }
    if(!out.is_object()){
      return method + " " + path + " answered something that is not a JSON object.";
    }
    return {};
  }


  nlohmann::json McpServer::_listNodes(const nlohmann::json& arguments)
  {
    nlohmann::json catalog;
    if(const std::string error = _getJson("/api/nodes", catalog); !error.empty()){
      return toolText(error, true);
    }

    const std::string category = arguments.contains("category") && arguments.at("category").is_string()
      ? arguments.at("category").get<std::string>() : std::string();
    nlohmann::json nodes = nlohmann::json::array();
    for(const auto& node : catalog.value("nodes", nlohmann::json::array())){
      const std::string type = node.value("type", "");
      if(!category.empty() && type.rfind(category, 0) != 0){
        continue;
      }
      nodes.push_back({
        {"type", type},
        {"purpose", node.value("purpose", "")},
        {"inputs", portLabels(node.value("inputs", nlohmann::json::array()))},
        {"outputs", portLabels(node.value("outputs", nlohmann::json::array()))}
      });
    }
    return toolJson({{"nodes", std::move(nodes)}});
  }


  nlohmann::json McpServer::_describeNode(const nlohmann::json& arguments)
  {
    if(!arguments.contains("type") || !arguments.at("type").is_string()){
      return toolText("describe_node needs a string 'type'. Call list_nodes for the types.", true);
    }
    const std::string type = arguments.at("type").get<std::string>();

    nlohmann::json catalog;
    if(const std::string error = _getJson("/api/nodes", catalog); !error.empty()){
      return toolText(error, true);
    }

    // On a miss, offer the types that contain the text, else every type.
    std::vector<std::string> near;
    std::vector<std::string> all;
    for(const auto& node : catalog.value("nodes", nlohmann::json::array())){
      const std::string candidate = node.value("type", "");
      if(candidate == type){
        return toolJson(node);
      }
      all.push_back(candidate);
      if(!type.empty() && candidate.find(type) != std::string::npos){
        near.push_back(candidate);
      }
    }
    const std::vector<std::string>& options = near.empty() ? all : near;
    std::string message = "Unknown node type '" + type + "'. Types:";
    for(const auto& option : options){
      message += " " + option;
    }
    return toolText(message, true);
  }


  nlohmann::json McpServer::_listPresets()
  {
    nlohmann::json presets;
    if(const std::string error = _getJson("/api/graph/presets", presets); !error.empty()){
      return toolText(error, true);
    }
    return toolJson(presets);
  }


  nlohmann::json McpServer::_getPreset(const nlohmann::json& arguments)
  {
    if(!arguments.contains("id") || !arguments.at("id").is_string() || !validPathSegment(arguments.at("id").get<std::string>())){
      return toolText("get_preset needs a string 'id'. Call list_presets for the ids.", true);
    }
    const std::string id = arguments.at("id").get<std::string>();

    nlohmann::json preset;
    int status = 0;
    if(const std::string error = _getJson("/api/graph/presets/" + id, preset, &status); !error.empty()){
      if(status == 404){
        return toolText("No preset '" + id + "'. Call list_presets for the ids.", true);
      }
      if(status == 409){
        return toolText("Aurora has no outputs configured yet, so a preset cannot be filled. Add an output in Aurora first.", true);
      }
      return toolText(error, true);
    }
    return toolJson(preset);
  }


  nlohmann::json McpServer::_saveDraft(const nlohmann::json& graph)
  {
    nlohmann::json reply;
    int status = 0;
    const std::string body = nlohmann::json{{"graph", graph}}.dump();
    if(const std::string error = _requestJson("PUT", "/api/graph/drafts/" + m_session, body, reply, &status); !error.empty()){
      if(status == 413){
        return toolText("The draft is too large for Aurora. Remove nodes or shorten params.", true);
      }
      if(status == 429){
        return toolText("Aurora holds too many drafts right now. Try again shortly.", true);
      }
      return toolText(error, true);
    }
    m_hasDraft = true;
    return toolJson({{"valid", reply.value("valid", false)}, {"errors", orNull(reply, "errors")}});
  }


  nlohmann::json McpServer::_putDraft(const nlohmann::json& arguments)
  {
    if(!arguments.contains("graph") || !arguments.at("graph").is_object()){
      return toolText("put_draft needs a 'graph' object. Start from get_preset or list_nodes.", true);
    }
    return _saveDraft(arguments.at("graph"));
  }


  nlohmann::json McpServer::_setControl(const nlohmann::json& arguments)
  {
    if(!arguments.contains("control") || !arguments.at("control").is_string() || !arguments.contains("value")){
      return toolText("set_control needs a string 'control' and a 'value'.", true);
    }
    const std::string wanted = arguments.at("control").get<std::string>();

    nlohmann::json current;
    int status = 0;
    if(const std::string error = _getJson("/api/graph/drafts/" + m_session, current, &status); !error.empty()){
      if(status == 404){
        return toolText("There is no draft yet. Call put_draft first.", true);
      }
      return toolText(error, true);
    }
    nlohmann::json graph = current.value("graph", nlohmann::json::object());

    std::string options;
    for(const auto& control : graph.value("controls", nlohmann::json::array())){
      const std::string node = control.value("node", "");
      const std::string param = control.value("param", "");
      const std::string key = node + "." + param;
      const std::string label = control.value("label", "");
      options += " '" + (label.empty() ? key : label) + "'";
      if(wanted != key && (label.empty() || wanted != label)){
        continue;
      }
      if(graph.contains("nodes") && graph.at("nodes").is_array()){
        for(auto& candidate : graph["nodes"]){
          if(candidate.value("id", "") == node){
            nlohmann::json value = arguments.at("value");
            // Some clients send every value as a string; read it as the param's current kind.
            if(const auto existing = candidate.contains("params") ? candidate["params"].find(param)
                                                                  : candidate.end();
               candidate.contains("params") && existing != candidate["params"].end()){
              if(existing->is_number() && value.is_string()){
                const std::string text = value.get<std::string>();
                std::size_t used = 0;
                double parsed = 0.0;
                try{ parsed = std::stod(text, &used); } catch(...){ used = 0; }
                if(used != 0 && used == text.size() && std::isfinite(parsed)){
                  value = parsed;
                }
              }
              else if(existing->is_boolean() && value.is_string()){
                const std::string text = value.get<std::string>();
                if(text == "true" || text == "false"){
                  value = (text == "true");
                }
              }
              const bool sameKind = (existing->is_number() && value.is_number())
                || (existing->is_boolean() && value.is_boolean())
                || (existing->is_string() && value.is_string())
                || (!existing->is_number() && !existing->is_boolean() && !existing->is_string());
              if(!sameKind){
                return toolText("Control '" + wanted + "' takes a " + (existing->is_number() ? "number" : existing->is_boolean() ? "true or false" : "text value")
                  + ", not " + value.dump() + ". The draft is unchanged.", true);
              }
            }
            candidate["params"][param] = value;
            return _saveDraft(graph);
          }
        }
      }
      return toolText("Control '" + wanted + "' names node '" + node + "', which the draft does not have.", true);
    }
    return toolText("No control '" + wanted + "' on the draft. Controls:" + (options.empty() ? " none" : options), true);
  }


  nlohmann::json McpServer::_preview(const nlohmann::json& arguments)
  {
    std::string path = "/api/graph/preview/summary?session=" + m_session;
    if(arguments.contains("seconds") && arguments.at("seconds").is_number()){
      path += "&seconds=" + std::to_string(arguments.at("seconds").get<double>());
    }

    nlohmann::json summary;
    int status = 0;
    if(const std::string error = _getJson(path, summary, &status); !error.empty()){
      if(status == 404){
        return toolText("There is no draft yet. Call put_draft first.", true);
      }
      if(status == 422){
        const std::string message = summary.value("message", "it does not build");
        if(const auto missing = missingInputMessage(message)){
          return toolText(*missing, true);
        }
        return toolText("The draft cannot be previewed: " + message + ". Check put_draft's errors.", true);
      }
      if(status == 409){
        return toolText("Aurora is paused or rebuilding its pipeline, so there is nothing to preview. Try again.", true);
      }
      return toolText(error, true);
    }

    bool reacting = false;
    for(auto& output : summary["outputs"]){
      const bool moves = output.value("change", 0.0) > kReactingChange;
      output["reacting"] = moves;
      reacting = reacting || moves;
    }
    summary["reacting"] = reacting;
    return toolJson(summary);
  }


  void McpServer::_startBeat(long long intervalMs)
  {
    _stopBeat();
    const auto interval = std::chrono::milliseconds(std::max(intervalMs, 10LL));
    const std::string body = nlohmann::json{{"session", m_session}}.dump();
    {
      std::lock_guard<std::mutex> lock(m_beatMutex);
      m_beatStop = false;
    }
    m_beat = std::thread([this, interval, body]{
      std::unique_lock<std::mutex> lock(m_beatMutex);
      while(!m_beatWake.wait_for(lock, interval, [this]{ return m_beatStop; })){
        lock.unlock();
        const HttpReply reply = m_beatFetch("POST", "/api/graph/test/heartbeat", body);
        lock.lock();
        // The test ended on Aurora's side (cap, pause or revert): nothing left to keep alive.
        if(reply.status == 404){
          return;
        }
      }
    });
  }


  void McpServer::_stopBeat()
  {
    {
      std::lock_guard<std::mutex> lock(m_beatMutex);
      m_beatStop = true;
    }
    m_beatWake.notify_all();
    if(m_beat.joinable()){
      m_beat.join();
    }
  }


  nlohmann::json McpServer::_tryOnLights()
  {
    nlohmann::json reply;
    int status = 0;
    const std::string body = nlohmann::json{{"session", m_session}}.dump();
    if(const std::string error = _requestJson("POST", "/api/graph/test", body, reply, &status); !error.empty()){
      if(status == 404){
        return toolText("There is no draft yet. Call put_draft first.", true);
      }
      if(status == 422){
        return toolJson({{"started", false}, {"valid", false}, {"errors", orNull(reply, "errors")}});
      }
      if(status == 409){
        const std::string message = reply.value("message", "Aurora is busy");
        if(const auto missing = missingInputMessage(message)){
          return toolText(*missing, true);
        }
        return toolText("The lights cannot be tested now: " + message + ". Try again, or check aurora_status.", true);
      }
      return toolText(error, true);
    }

    m_testing = true;
    _startBeat(reply.value("heartbeatMs", 2000LL));
    return toolJson({
      {"started", true},
      {"confirmWithinMs", orNull(reply, "confirmWithinMs")},
      {"revertAfterMs", orNull(reply, "revertAfterMs")},
      {"next", "Ask the user how it looks, then call keep with an id or revert."}
    });
  }


  nlohmann::json McpServer::_revert()
  {
    _stopBeat();
    nlohmann::json reply;
    int status = 0;
    const std::string body = nlohmann::json{{"session", m_session}}.dump();
    const std::string error = _requestJson("POST", "/api/graph/test/revert", body, reply, &status);
    if(!error.empty() && status != 404){
      return toolText(error, true);
    }
    m_testing = false;
    if(status == 404){
      return toolJson({{"reverted", false}, {"note", "No test was running. It may have ended already."}});
    }
    nlohmann::json out = {{"reverted", true}};
    if(reply.contains("revertError")){
      out["revertError"] = reply.at("revertError");
    }
    return toolJson(out);
  }


  std::string McpServer::_recordPrevious()
  {
    if(m_hasPrevious){
      return {};
    }
    nlohmann::json effects;
    if(const std::string error = _getJson("/api/effects", effects); !error.empty()){
      return error;
    }
    m_previousEffect = effects.value("activeEffectId", "");
    m_hasPrevious = true;
    return {};
  }


  nlohmann::json McpServer::_appliedResult(const std::string& id, const nlohmann::json& reply)
  {
    const nlohmann::json effect = orNull(reply, "effect");
    nlohmann::json out = {{"id", id}, {"effect", effect}, {"requestedEffect", orNull(reply, "requestedEffect")}};
    if(reply.contains("reloadError")){
      out["reloadError"] = reply.at("reloadError");
    }
    // A graph that fails to load runs as a built-in instead of the one asked for.
    if(effect != id || reply.contains("reloadError")){
      out["applied"] = false;
      out["note"] = "Aurora is not running '" + id + "'. Fix the draft and apply again, or call revert_effect.";
      nlohmann::json result = toolJson(out);
      result["isError"] = true;
      return result;
    }
    out["applied"] = true;
    return toolJson(out);
  }


  nlohmann::json McpServer::_keep(const nlohmann::json& arguments)
  {
    if(!arguments.contains("id") || !arguments.at("id").is_string() || !validPathSegment(arguments.at("id").get<std::string>())){
      return toolText("keep needs a string 'id' to save the effect as.", true);
    }
    const std::string id = arguments.at("id").get<std::string>();
    if(const std::string error = _recordPrevious(); !error.empty()){
      return toolText(error, true);
    }

    nlohmann::json reply;
    int status = 0;
    const std::string body = nlohmann::json{{"session", m_session}, {"id", id}}.dump();
    if(const std::string error = _requestJson("POST", "/api/graph/test/confirm", body, reply, &status); !error.empty()){
      if(status == 404){
        _stopBeat();
        m_testing = false;
        return toolText("No light test is running, so the lights are back as before. Call try_on_lights again.", true);
      }
      if(status == 409){
        return toolText("The draft changed since the test started. Call revert, then try_on_lights again.", true);
      }
      if(status == 422){
        return toolJson({{"applied", false}, {"valid", false}, {"errors", orNull(reply, "errors")}});
      }
      return toolText(error, true);
    }
    _stopBeat();
    m_testing = false;
    return _appliedResult(id, reply);
  }


  nlohmann::json McpServer::_apply(const nlohmann::json& arguments)
  {
    if(!arguments.contains("id") || !arguments.at("id").is_string() || !validPathSegment(arguments.at("id").get<std::string>())){
      return toolText("apply needs a string 'id' to save the effect as.", true);
    }
    const std::string id = arguments.at("id").get<std::string>();
    if(const std::string error = _recordPrevious(); !error.empty()){
      return toolText(error, true);
    }

    nlohmann::json reply;
    int status = 0;
    const std::string body = nlohmann::json{{"session", m_session}, {"id", id}}.dump();
    if(const std::string error = _requestJson("POST", "/api/graph/apply", body, reply, &status); !error.empty()){
      if(status == 404){
        return toolText("There is no draft yet. Call put_draft first.", true);
      }
      if(status == 422){
        return toolJson({{"applied", false}, {"valid", false}, {"errors", orNull(reply, "errors")}});
      }
      return toolText(error, true);
    }
    return _appliedResult(id, reply);
  }


  nlohmann::json McpServer::_revertEffect()
  {
    if(!m_hasPrevious){
      return toolText("Nothing to revert to: no graph was applied in this session.", true);
    }
    nlohmann::json reply;
    const std::string body = nlohmann::json{{"activeEffectId", m_previousEffect}}.dump();
    if(const std::string error = _requestJson("PUT", "/api/effects", body, reply, nullptr); !error.empty()){
      return toolText(error, true);
    }
    nlohmann::json out = {{"restored", m_previousEffect.empty() ? nlohmann::json("default") : nlohmann::json(m_previousEffect)},
      {"effect", orNull(reply, "effect")}};
    if(reply.contains("reloadError")){
      out["reloadError"] = reply.at("reloadError");
    }
    return toolJson(out);
  }


  nlohmann::json McpServer::_auroraStatus()
  {
    nlohmann::json state;
    nlohmann::json capabilities;
    nlohmann::json test;
    nlohmann::json config;
    const std::pair<const char*, nlohmann::json*> reads[] = {
      {"/api/state", &state}, {"/api/capabilities", &capabilities}, {"/api/graph/test", &test}, {"/api/config", &config}
    };
    for(const auto& [path, out] : reads){
      const std::string error = _getJson(path, *out);
      if(!error.empty()){
        return toolText(error, true);
      }
    }

    const nlohmann::json effect = orNull(state, "effect");
    const nlohmann::json requested = orNull(state, "requestedEffect");
    // A requested effect that failed to load runs as the built-in instead.
    const bool fallback = !requested.is_null() && !effect.is_null() && requested != effect;

    const nlohmann::json status = {
      {"state", orNull(state, "state")},
      {"running", state.value("state", "") == "running"},
      {"paused", state.value("paused", false)},
      {"effect", effect},
      {"requestedEffect", requested},
      {"fallback", fallback},
      {"inputs", orNull(state, "source")},
      // What the user chose, running or not. A graph can only use these.
      {"configuredInputs", {{"video", nameOrNull(config, "activeInputName")}, {"audio", nameOrNull(config, "activeAudioInputName")}}},
      {"outputs", orNull(capabilities, "outputs")},
      {"errors", orNull(state, "errors")},
      {"activeTest", test.value("active", false)
        ? nlohmann::json{{"confirmRemainingMs", orNull(test, "confirmRemainingMs")}, {"revertAfterMs", orNull(test, "revertAfterMs")}}
        : nlohmann::json(nullptr)}
    };
    return toolJson(status);
  }
}
