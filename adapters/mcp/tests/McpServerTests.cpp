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

  json callTool(McpServer& server, const std::string& name, const std::string& arguments = "{}")
  {
    return call(server, R"({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":")" + name
      + R"(","arguments":)" + arguments + "}}");
  }

  json callStatus(McpServer& server)
  {
    return callTool(server, "aurora_status");
  }

  const char* kNodesBody = R"({"nodes":[
    {"type":"audio.bands","purpose":"Bass, mid and treble loudness.","useWhen":"x","example":"y","cost":"low",
     "inputs":[{"name":"buffer","type":"AudioBuffer","required":true}],
     "outputs":[{"name":"bass","type":"Float"},{"name":"mid","type":"Float"}],
     "params":[{"name":"bassMaxHz","kind":"float","min":20,"max":20000,"default":250}]},
    {"type":"math.add","purpose":"Add two floats.","useWhen":"x","example":"y","cost":"low",
     "inputs":[{"name":"a","type":"Float","required":true},{"name":"b","type":"Float","required":false}],
     "outputs":[{"name":"value","type":"Float"}],"params":[]}
  ]})";

  std::map<std::string, HttpReply> nodeRoutes()
  {
    return {
      {"/api/nodes", {200, kNodesBody, {}}},
      {"/api/graph/presets", {200, R"({"presets":[{"id":"spatial","title":"Rainbow sweep","inputs":[],"controls":["Sweep speed"]}]})", {}}},
      {"/api/graph/presets/spatial", {200, R"({"id":"spatial","valid":true,"errors":[],"outputs":["hue"],"graph":{"version":1}})", {}}},
      {"/api/graph/presets/both", {409, R"({"error":"no_outputs"})", {}}}
    };
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

TEST_CASE("tools/list advertises the read tools, all read-only")
{
  McpServer server(scripted({}), "1.0");
  const json tools = call(server, R"({"jsonrpc":"2.0","id":1,"method":"tools/list"})")["result"]["tools"];
  std::vector<std::string> names;
  for(const auto& tool : tools){
    names.push_back(tool["name"]);
    CHECK(tool["inputSchema"]["type"] == "object");
    CHECK(tool["annotations"]["readOnlyHint"] == true);
  }
  CHECK(names == std::vector<std::string>{"aurora_status", "list_nodes", "describe_node", "list_presets", "get_preset"});
}

TEST_CASE("aurora_status reports live state")
{
  McpServer server(scripted(liveRoutes()), "1.0");
  const json result = callStatus(server)["result"];
  CHECK(result["isError"] == false);

  const json status = json::parse(result["content"][0]["text"].get<std::string>());
  CHECK(result["structuredContent"] == status);
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

TEST_CASE("list_nodes returns a compact list with the structured copy")
{
  McpServer server(scripted(nodeRoutes()), "1.0");
  const json result = callTool(server, "list_nodes")["result"];
  CHECK(result["isError"] == false);

  const json nodes = result["structuredContent"]["nodes"];
  REQUIRE(nodes.size() == 2);
  CHECK(json::parse(result["content"][0]["text"].get<std::string>())["nodes"] == nodes);
  CHECK(nodes[0]["type"] == "audio.bands");
  CHECK(nodes[0]["inputs"] == json::array({"buffer:AudioBuffer"}));
  CHECK(nodes[0]["outputs"] == json::array({"bass:Float", "mid:Float"}));
  CHECK(nodes[1]["inputs"] == json::array({"a:Float", "b:Float?"}));
  CHECK_FALSE(nodes[0].contains("params"));
  CHECK_FALSE(nodes[0].contains("useWhen"));

  const json audioOnly = callTool(server, "list_nodes", R"({"category":"audio"})")["result"]["structuredContent"]["nodes"];
  REQUIRE(audioOnly.size() == 1);
  CHECK(audioOnly[0]["type"] == "audio.bands");
}

TEST_CASE("describe_node returns the full descriptor, a miss lists candidates")
{
  McpServer server(scripted(nodeRoutes()), "1.0");

  const json found = callTool(server, "describe_node", R"({"type":"audio.bands"})")["result"];
  CHECK(found["isError"] == false);
  CHECK(found["structuredContent"]["params"][0]["name"] == "bassMaxHz");
  CHECK(found["structuredContent"]["useWhen"] == "x");

  const json miss = callTool(server, "describe_node", R"({"type":"bands"})")["result"];
  CHECK(miss["isError"] == true);
  const std::string text = miss["content"][0]["text"];
  CHECK(text.find("audio.bands") != std::string::npos);
  CHECK(text.find("math.add") == std::string::npos);

  CHECK(callTool(server, "describe_node", R"({"type":"nope"})")["result"]["content"][0]["text"].get<std::string>().find("math.add")
    != std::string::npos);
  CHECK(callTool(server, "describe_node")["result"]["isError"] == true);
}

TEST_CASE("Preset tools pass the core route through")
{
  McpServer server(scripted(nodeRoutes()), "1.0");

  const json list = callTool(server, "list_presets")["result"];
  CHECK(list["isError"] == false);
  CHECK(list["structuredContent"]["presets"][0]["id"] == "spatial");

  const json preset = callTool(server, "get_preset", R"({"id":"spatial"})")["result"];
  CHECK(preset["isError"] == false);
  CHECK(preset["structuredContent"]["valid"] == true);
  CHECK(preset["structuredContent"]["outputs"] == json::array({"hue"}));

  const json unknown = callTool(server, "get_preset", R"({"id":"nope"})")["result"];
  CHECK(unknown["isError"] == true);
  CHECK(unknown["content"][0]["text"].get<std::string>().find("list_presets") != std::string::npos);

  CHECK(callTool(server, "get_preset", R"({"id":"both"})")["result"]["content"][0]["text"].get<std::string>().find("outputs")
    != std::string::npos);

  // An id that is not a plain path segment never reaches the fetch.
  CHECK(callTool(server, "get_preset", R"({"id":"../state"})")["result"]["isError"] == true);
  CHECK(callTool(server, "get_preset")["result"]["isError"] == true);
}

TEST_CASE("Node and preset tools report an unreachable Aurora as an error result")
{
  McpServer server(scripted({{"/api/nodes", {0, {}, "Connection"}}, {"/api/graph/presets", {0, {}, "Connection"}}}), "1.0");
  for(const char* tool : {"list_nodes", "list_presets"}){
    const json result = callTool(server, tool)["result"];
    CHECK(result["isError"] == true);
    CHECK(result["content"][0]["text"].get<std::string>().find("not reachable") != std::string::npos);
  }
}
