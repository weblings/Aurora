#include "McpServer.hpp"

#include <algorithm>
#include <array>
#include <cctype>
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
      "To write a graph, find node types with list_nodes and describe_node, or start "
      "from list_presets and get_preset.";

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
  }


  McpServer::McpServer(Fetch fetch, std::string serverVersion)
    : m_fetch(std::move(fetch)), m_serverVersion(std::move(serverVersion))
  {}


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
    const nlohmann::json idProperty = {{"id", {{"type", "string"}, {"description", "Preset id from list_presets."}}}};
    return {{"tools", nlohmann::json::array({
      readOnlyTool("aurora_status",
        "Read Aurora's live state: running or paused, the requested and running effect, "
        "whether a fallback effect is running, the video and audio inputs, the outputs, "
        "and any active light test."),
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
        idProperty, nlohmann::json::array({"id"}))
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
    throw RpcError(kInvalidParams, "unknown tool: " + name);
  }


  std::string McpServer::_getJson(const std::string& path, nlohmann::json& out, int* status)
  {
    // Failures are tool results (isError), so the agent can read and act on them.
    const HttpReply reply = m_fetch(path);
    if(status){
      *status = reply.status;
    }
    if(reply.status == 0){
      return "Aurora is not reachable (" + reply.error + "). Start Aurora and check AURORA_URL.";
    }
    if(reply.status == 401 || reply.status == 403){
      return "Aurora refused the request (HTTP " + std::to_string(reply.status) + "). Set AURORA_TOKEN to a paired token.";
    }
    if(reply.status != 200){
      return "GET " + path + " answered HTTP " + std::to_string(reply.status) + ".";
    }
    try{
      out = nlohmann::json::parse(reply.body);
    }
    catch(const nlohmann::json::exception&){
      return "GET " + path + " answered something that is not JSON.";
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


  nlohmann::json McpServer::_auroraStatus()
  {
    nlohmann::json state;
    nlohmann::json capabilities;
    nlohmann::json test;
    const std::pair<const char*, nlohmann::json*> reads[] = {
      {"/api/state", &state}, {"/api/capabilities", &capabilities}, {"/api/graph/test", &test}
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
      {"outputs", orNull(capabilities, "outputs")},
      {"errors", orNull(state, "errors")},
      {"activeTest", test.value("active", false)
        ? nlohmann::json{{"confirmRemainingMs", orNull(test, "confirmRemainingMs")}, {"revertAfterMs", orNull(test, "revertAfterMs")}}
        : nlohmann::json(nullptr)}
    };
    return toolJson(status);
  }
}
