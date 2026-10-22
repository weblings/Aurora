#pragma once

#include <nlohmann/json.hpp>

#include <functional>
#include <optional>
#include <string>

namespace Aurora::Mcp
{
  struct HttpReply
  {
    int status{0};
    std::string body;
    // Transport failure (connection refused, timeout); status stays 0.
    std::string error;
  };

  // One request against Aurora's REST API, path including the query. Injected so
  // tests script the app without a socket.
  using Fetch = std::function<HttpReply(const std::string& method, const std::string& path, const std::string& body)>;

  // Transport-free MCP server: one JSON-RPC line in, at most one line out.
  class McpServer
  {
  public:
    // `session` names this adapter's one draft, stable for the process.
    McpServer(Fetch fetch, std::string serverVersion, std::string session = "mcp");

    // Deletes the draft this adapter saved, if any. Called when stdin closes.
    void shutdown();

    // Empty for notifications and responses, which never get an answer.
    std::optional<std::string> handleLine(const std::string& line);

    static const char* latestProtocolVersion();

  private:
    nlohmann::json _initialize(const nlohmann::json& params);
    nlohmann::json _toolsList() const;
    nlohmann::json _toolsCall(const nlohmann::json& params);
    nlohmann::json _auroraStatus();
    nlohmann::json _listNodes(const nlohmann::json& arguments);
    nlohmann::json _describeNode(const nlohmann::json& arguments);
    nlohmann::json _listPresets();
    nlohmann::json _getPreset(const nlohmann::json& arguments);
    nlohmann::json _putDraft(const nlohmann::json& arguments);
    nlohmann::json _setControl(const nlohmann::json& arguments);
    nlohmann::json _preview(const nlohmann::json& arguments);

    // Saves the graph as this session's draft: its validation, or an error result.
    nlohmann::json _saveDraft(const nlohmann::json& graph);

    // GETs a JSON body. Empty on success, else the message for an error result.
    // `status` receives the HTTP status when given.
    std::string _getJson(const std::string& path, nlohmann::json& out, int* status = nullptr);
    std::string _requestJson(const std::string& method, const std::string& path, const std::string& body,
      nlohmann::json& out, int* status);

    Fetch m_fetch;
    std::string m_serverVersion;
    std::string m_session;
    bool m_hasDraft{false};
  };
}
