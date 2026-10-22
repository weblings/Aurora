#include "McpServer.hpp"

#include <algorithm>
#include <array>
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
      "to see whether Aurora is running, which effect is live, and what is connected.";

    nlohmann::json errorResponse(const nlohmann::json& id, int code, const std::string& message)
    {
      return {{"jsonrpc", "2.0"}, {"id", id}, {"error", {{"code", code}, {"message", message}}}};
    }

    nlohmann::json toolText(const std::string& text, bool isError)
    {
      return {{"content", nlohmann::json::array({{{"type", "text"}, {"text", text}}})}, {"isError", isError}};
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
    return {{"tools", nlohmann::json::array({
      {
        {"name", "aurora_status"},
        {"description", "Read Aurora's live state: running or paused, the requested and running effect, "
                        "whether a fallback effect is running, the video and audio inputs, the outputs, "
                        "and any active light test."},
        {"inputSchema", {{"type", "object"}, {"properties", nlohmann::json::object()}}},
        {"annotations", {{"readOnlyHint", true}}}
      }
    })}};
  }


  nlohmann::json McpServer::_toolsCall(const nlohmann::json& params)
  {
    if(!params.is_object() || !params.contains("name") || !params.at("name").is_string()){
      throw RpcError(kInvalidParams, "name is required");
    }
    const std::string name = params.at("name").get<std::string>();
    if(name != "aurora_status"){
      throw RpcError(kInvalidParams, "unknown tool: " + name);
    }
    return _auroraStatus();
  }


  nlohmann::json McpServer::_auroraStatus()
  {
    // Failures are tool results (isError), so the agent can read and act on them.
    auto get = [this](const std::string& path, nlohmann::json& out) -> std::string {
      const HttpReply reply = m_fetch(path);
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
    };

    nlohmann::json state;
    nlohmann::json capabilities;
    nlohmann::json test;
    const std::pair<const char*, nlohmann::json*> reads[] = {
      {"/api/state", &state}, {"/api/capabilities", &capabilities}, {"/api/graph/test", &test}
    };
    for(const auto& [path, out] : reads){
      const std::string error = get(path, *out);
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
    return toolText(status.dump(), false);
  }
}
