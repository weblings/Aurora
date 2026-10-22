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

  // GET against Aurora's REST API, path including the query. Injected so tests
  // script the app without a socket.
  using Fetch = std::function<HttpReply(const std::string& path)>;

  // Transport-free MCP server: one JSON-RPC line in, at most one line out.
  class McpServer
  {
  public:
    McpServer(Fetch fetch, std::string serverVersion);

    // Empty for notifications and responses, which never get an answer.
    std::optional<std::string> handleLine(const std::string& line);

    static const char* latestProtocolVersion();

  private:
    nlohmann::json _initialize(const nlohmann::json& params);
    nlohmann::json _toolsList() const;
    nlohmann::json _toolsCall(const nlohmann::json& params);
    nlohmann::json _auroraStatus();

    Fetch m_fetch;
    std::string m_serverVersion;
  };
}
