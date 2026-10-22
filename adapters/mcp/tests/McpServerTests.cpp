#include <catch2/catch_test_macros.hpp>

#include "McpServer.hpp"

#include <map>

using Aurora::Mcp::Fetch;
using Aurora::Mcp::HttpReply;
using Aurora::Mcp::McpServer;
using nlohmann::json;

namespace
{
  Fetch scripted(std::map<std::string, HttpReply> routes)
  {
    return [routes = std::move(routes)](const std::string& path){
      const auto found = routes.find(path);
      return found == routes.end() ? HttpReply{404, "{}", {}} : found->second;
    };
  }

  std::map<std::string, HttpReply> liveRoutes()
  {
    return {
      {"/api/state", {200, R"({"state":"running","paused":false,"effect":"builtin-video",
        "requestedEffect":"builtin-video","source":{"video":{"input":"windows","monitor":"DP-1"},"audio":null},
        "errors":[]})", {}}},
      {"/api/capabilities", {200, R"({"outputs":["hue"]})", {}}},
      {"/api/graph/test", {200, R"({"active":false,"lastEnd":null})", {}}}
    };
  }

  json call(McpServer& server, const std::string& line)
  {
    const auto reply = server.handleLine(line);
    REQUIRE(reply.has_value());
    return json::parse(*reply);
  }

  json callStatus(McpServer& server)
  {
    return call(server, R"({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"aurora_status"}})");
  }
}


TEST_CASE("Framing: replies are one line, notifications get none")
{
  McpServer server(scripted({}), "1.0");

  const auto reply = server.handleLine(R"({"jsonrpc":"2.0","id":7,"method":"ping"})");
  REQUIRE(reply.has_value());
  CHECK(reply->find('\n') == std::string::npos);
  CHECK(json::parse(*reply) == json::parse(R"({"jsonrpc":"2.0","id":7,"result":{}})"));

  CHECK_FALSE(server.handleLine(R"({"jsonrpc":"2.0","method":"notifications/initialized"})").has_value());
  CHECK_FALSE(server.handleLine(R"({"jsonrpc":"2.0","id":1,"result":{}})").has_value());
}

TEST_CASE("Framing: malformed input answers a JSON-RPC error")
{
  McpServer server(scripted({}), "1.0");

  CHECK(call(server, "{not json")["error"]["code"] == -32700);
  CHECK(call(server, R"([{"jsonrpc":"2.0","id":1,"method":"ping"}])")["error"]["code"] == -32600);
  CHECK(call(server, R"({"id":1,"method":"ping"})")["error"]["code"] == -32600);
  CHECK(call(server, R"({"jsonrpc":"2.0","id":1,"method":"nope"})")["error"]["code"] == -32601);
  CHECK(call(server, R"({"jsonrpc":"2.0","id":"a","method":"nope"})")["id"] == "a");
}

TEST_CASE("Version negotiation echoes a supported version, else offers the latest")
{
  McpServer server(scripted({}), "1.2.3");

  for(const char* version : {"2025-06-18", "2025-03-26", "2024-11-05"}){
    const json reply = call(server, std::string(R"({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":")")
      + version + R"("}})");
    CHECK(reply["result"]["protocolVersion"] == version);
  }

  const json future = call(server, R"({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2030-01-01"}})");
  CHECK(future["result"]["protocolVersion"] == McpServer::latestProtocolVersion());
  CHECK(future["result"]["serverInfo"]["version"] == "1.2.3");
  CHECK(future["result"]["capabilities"].contains("tools"));
  CHECK_FALSE(future["result"]["instructions"].get<std::string>().empty());

  CHECK(call(server, R"({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}})")["error"]["code"] == -32602);
}

TEST_CASE("tools/list advertises aurora_status only")
{
  McpServer server(scripted({}), "1.0");
  const json tools = call(server, R"({"jsonrpc":"2.0","id":1,"method":"tools/list"})")["result"]["tools"];
  REQUIRE(tools.size() == 1);
  CHECK(tools[0]["name"] == "aurora_status");
  CHECK(tools[0]["inputSchema"]["type"] == "object");
}

TEST_CASE("aurora_status reports live state")
{
  McpServer server(scripted(liveRoutes()), "1.0");
  const json result = callStatus(server)["result"];
  CHECK(result["isError"] == false);

  const json status = json::parse(result["content"][0]["text"].get<std::string>());
  CHECK(status["running"] == true);
  CHECK(status["effect"] == "builtin-video");
  CHECK(status["fallback"] == false);
  CHECK(status["inputs"]["video"]["monitor"] == "DP-1");
  CHECK(status["outputs"] == json::array({"hue"}));
  CHECK(status["activeTest"].is_null());
}

TEST_CASE("aurora_status flags a fallback effect and an active test")
{
  auto routes = liveRoutes();
  routes["/api/state"].body = R"({"state":"running","paused":false,"effect":"builtin-video","requestedEffect":"mine"})";
  routes["/api/graph/test"].body = R"({"active":true,"confirmRemainingMs":9000,"revertAfterMs":30000})";
  McpServer server(scripted(routes), "1.0");

  const json status = json::parse(callStatus(server)["result"]["content"][0]["text"].get<std::string>());
  CHECK(status["fallback"] == true);
  CHECK(status["requestedEffect"] == "mine");
  CHECK(status["activeTest"]["confirmRemainingMs"] == 9000);
}

TEST_CASE("Tool failures are error results, protocol misuse is a JSON-RPC error")
{
  SECTION("Aurora unreachable"){
    McpServer server(scripted({{"/api/state", {0, {}, "Connection"}}}), "1.0");
    const json result = callStatus(server)["result"];
    CHECK(result["isError"] == true);
    CHECK(result["content"][0]["text"].get<std::string>().find("not reachable") != std::string::npos);
  }

  SECTION("Token refused"){
    McpServer server(scripted({{"/api/state", {401, "{}", {}}}}), "1.0");
    const json result = callStatus(server)["result"];
    CHECK(result["isError"] == true);
    CHECK(result["content"][0]["text"].get<std::string>().find("AURORA_TOKEN") != std::string::npos);
  }

  SECTION("Body is not JSON"){
    auto routes = liveRoutes();
    routes["/api/capabilities"].body = "<html>";
    McpServer server(scripted(routes), "1.0");
    CHECK(callStatus(server)["result"]["isError"] == true);
  }

  SECTION("Unknown tool and missing name"){
    McpServer server(scripted(liveRoutes()), "1.0");
    CHECK(call(server, R"({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x"}})")["error"]["code"] == -32602);
    CHECK(call(server, R"({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{}})")["error"]["code"] == -32602);
  }
}
