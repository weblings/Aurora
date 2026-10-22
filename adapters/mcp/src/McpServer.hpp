#pragma once

#include <nlohmann/json.hpp>

#include <condition_variable>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

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
    // `session` names this adapter's one draft, stable for the process. The heartbeat
    // thread uses `beatFetch` (its own connection) when given, else `fetch`.
    McpServer(Fetch fetch, std::string serverVersion, std::string session = "mcp", Fetch beatFetch = {});
    ~McpServer();

    McpServer(const McpServer&) = delete;
    McpServer& operator=(const McpServer&) = delete;

    // Reverts a running light test and deletes the draft this adapter saved, if any.
    // Called when stdin closes.
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
    nlohmann::json _tryOnLights();
    nlohmann::json _keep(const nlohmann::json& arguments);
    nlohmann::json _revert();
    nlohmann::json _apply(const nlohmann::json& arguments);
    nlohmann::json _revertEffect();

    // Remembers the effect live before this session's first apply. Empty on success.
    std::string _recordPrevious();
    // Shared by apply and keep: a fallback effect or reload error is a failure.
    nlohmann::json _appliedResult(const std::string& id, const nlohmann::json& reply);

    void _startBeat(long long intervalMs);
    void _stopBeat();

    // Saves the graph as this session's draft: its validation, or an error result.
    nlohmann::json _saveDraft(const nlohmann::json& graph);

    // GETs a JSON body. Empty on success, else the message for an error result.
    // `status` receives the HTTP status when given.
    std::string _paramKind(const std::string& nodeType, const std::string& param);
    std::string _getJson(const std::string& path, nlohmann::json& out, int* status = nullptr);
    std::string _requestJson(const std::string& method, const std::string& path, const std::string& body,
      nlohmann::json& out, int* status);

    Fetch m_fetch;
    Fetch m_beatFetch;
    std::string m_serverVersion;
    std::string m_session;
    bool m_hasDraft{false};
    bool m_testing{false};

    // Effect id (empty is the default) active before this session's first apply.
    bool m_hasPrevious{false};
    std::string m_previousEffect;

    std::thread m_beat;
    std::mutex m_beatMutex;
    std::condition_variable m_beatWake;
    bool m_beatStop{false};
  };
}
