#include <catch2/catch_test_macros.hpp>

#include "McpServer.hpp"
#include "Pair.hpp"

#include <chrono>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <sstream>
#include <thread>
#include <vector>

using Aurora::Mcp::Fetch;
using Aurora::Mcp::HttpReply;
using Aurora::Mcp::McpServer;
using nlohmann::json;

namespace
{
  // Routes are keyed by path for GET and "METHOD path" otherwise.
  Fetch scripted(std::map<std::string, HttpReply> routes)
  {
    return [routes = std::move(routes)](const std::string& method, const std::string& path, const std::string&){
      const auto found = routes.find(method == "GET" ? path : method + " " + path);
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
      {"/api/graph/test", {200, R"({"active":false,"lastEnd":null})", {}}},
      {"/api/config", {200, R"({"activeInputName":"windows","activeAudioInputName":""})", {}}}
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

TEST_CASE("tools/list advertises the tools, only the draft writers not read-only")
{
  McpServer server(scripted({}), "1.0");
  const json tools = call(server, R"({"jsonrpc":"2.0","id":1,"method":"tools/list"})")["result"]["tools"];
  std::vector<std::string> names;
  for(const auto& tool : tools){
    const std::string name = tool["name"];
    names.push_back(name);
    CHECK(tool["inputSchema"]["type"] == "object");
    const bool writes = name == "put_draft" || name == "set_control" || name == "try_on_lights" || name == "keep"
      || name == "revert" || name == "apply" || name == "revert_effect";
    CHECK(tool["annotations"]["readOnlyHint"] == !writes);
  }
  CHECK(names == std::vector<std::string>{"aurora_status", "list_nodes", "describe_node", "list_presets", "get_preset",
    "put_draft", "set_control", "preview", "try_on_lights", "keep", "revert", "apply", "revert_effect"});
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
  CHECK(status["configuredInputs"] == json::parse(R"({"video":"windows","audio":null})"));
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
    CHECK(result["content"][0]["text"].get<std::string>().find("--pair") != std::string::npos);
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


namespace
{
  // A draft store in a lambda: an invalid graph is one with "bad":true, and every request is logged.
  struct FakeDrafts
  {
    std::vector<std::string> log;
    std::optional<json> draft;
    // One node type with params the draft below leaves unset.
    std::string nodeCatalog = R"({"nodes":[{"type":"test.kinds","params":[
      {"name":"width","kind":"float"},{"name":"seed","kind":"optional-float"},
      {"name":"clamp","kind":"bool"},{"name":"shape","kind":"enum","options":["saw","sine"]}]}]})";
    std::string previewBody = R"({"session":"t","seconds":1,"samples":4,"outputs":[{"output":"hue","change":0.0,"zones":[]}],"errors":[]})";

    Fetch fetch()
    {
      return [this](const std::string& method, const std::string& path, const std::string& body){
        log.push_back(method + " " + path);
        if(method == "PUT"){
          draft = json::parse(body).at("graph");
          const bool bad = draft->value("bad", false);
          json reply = {{"succeeded", true}, {"valid", !bad}, {"errors", json::array()}};
          if(bad){
            reply["errors"].push_back({{"code", "node_type_unknown"}, {"node", "a"}, {"options", json::array({"math.add"})}});
          }
          return HttpReply{200, reply.dump(), {}};
        }
        if(method == "DELETE"){
          draft.reset();
          return HttpReply{200, "{}", {}};
        }
        if(path.rfind("/api/graph/drafts/", 0) == 0){
          return draft ? HttpReply{200, json{{"graph", *draft}}.dump(), {}} : HttpReply{404, R"({"error":"no_draft"})", {}};
        }
        if(path == "/api/nodes"){
          return HttpReply{200, nodeCatalog, {}};
        }
        if(path.rfind("/api/graph/preview/summary", 0) == 0){
          return draft ? HttpReply{200, previewBody, {}} : HttpReply{404, R"({"error":"no_draft"})", {}};
        }
        return HttpReply{404, "{}", {}};
      };
    }
  };

  const char* kGoodGraph = R"({"version":1,"nodes":[{"id":"gain","type":"math.mul","params":{"b":1.0}}],"edges":[],
    "controls":[{"node":"gain","param":"b","label":"Brightness"}]})";
}


TEST_CASE("put_draft: an invalid graph is a normal result with codes and options")
{
  FakeDrafts app;
  McpServer server(app.fetch(), "1.0", "t");

  const json bad = callTool(server, "put_draft", R"({"graph":{"version":1,"bad":true}})")["result"];
  CHECK(bad["isError"] == false);
  CHECK(bad["structuredContent"]["valid"] == false);
  CHECK(bad["structuredContent"]["errors"][0]["code"] == "node_type_unknown");
  CHECK(bad["structuredContent"]["errors"][0]["options"][0] == "math.add");

  const json fixed = callTool(server, "put_draft", std::string(R"({"graph":)") + kGoodGraph + "}")["result"];
  CHECK(fixed["structuredContent"]["valid"] == true);
  CHECK(app.log.front() == "PUT /api/graph/drafts/t");

  CHECK(callTool(server, "put_draft", "{}")["result"]["isError"] == true);
}

TEST_CASE("put_draft: transport and refusal are tool errors")
{
  McpServer down(scripted({{"PUT /api/graph/drafts/t", {0, {}, "Connection"}}}), "1.0", "t");
  CHECK(callTool(down, "put_draft", R"({"graph":{}})")["result"]["isError"] == true);

  McpServer refused(scripted({{"PUT /api/graph/drafts/t", {401, "{}", {}}}}), "1.0", "t");
  const json result = callTool(refused, "put_draft", R"({"graph":{}})")["result"];
  CHECK(result["isError"] == true);
  CHECK(result["content"][0]["text"].get<std::string>().find("AURORA_TOKEN") != std::string::npos);

  // 403: a valid token below the scope this call needs, named so the user re-pairs.
  McpServer readOnly(scripted({{"PUT /api/graph/drafts/t", {403, "{}", {}}}}), "1.0", "t");
  const std::string draftText = callTool(readOnly, "put_draft", R"({"graph":{}})")["result"]["content"][0]["text"];
  CHECK(draftText.find("(draft)") != std::string::npos);
  CHECK(draftText.find("--pair") != std::string::npos);
  McpServer draftOnly(scripted({{"POST /api/graph/test", {403, "{}", {}}}}), "1.0", "t");
  CHECK(callTool(draftOnly, "try_on_lights")["result"]["content"][0]["text"].get<std::string>().find("(apply)") != std::string::npos);

  McpServer tooBig(scripted({{"PUT /api/graph/drafts/t", {413, R"({"error":"draft_too_large"})", {}}}}), "1.0", "t");
  CHECK(callTool(tooBig, "put_draft", R"({"graph":{}})")["result"]["isError"] == true);
}

TEST_CASE("set_control changes one param by label or node.param")
{
  FakeDrafts app;
  McpServer server(app.fetch(), "1.0", "t");

  CHECK(callTool(server, "set_control", R"({"control":"Brightness","value":0.5})")["result"]["isError"] == true);

  callTool(server, "put_draft", std::string(R"({"graph":)") + kGoodGraph + "}");
  const json byLabel = callTool(server, "set_control", R"({"control":"Brightness","value":0.5})")["result"];
  CHECK(byLabel["isError"] == false);
  CHECK(byLabel["structuredContent"]["valid"] == true);
  CHECK(app.draft->at("nodes")[0]["params"]["b"] == 0.5);

  callTool(server, "set_control", R"({"control":"gain.b","value":0.25})");
  CHECK(app.draft->at("nodes")[0]["params"]["b"] == 0.25);

  const json miss = callTool(server, "set_control", R"({"control":"Nope","value":1})")["result"];
  CHECK(miss["isError"] == true);
  CHECK(miss["content"][0]["text"].get<std::string>().find("'Brightness'") != std::string::npos);
}

TEST_CASE("set_control reads a string as the param's kind and refuses a wrong kind without saving")
{
  FakeDrafts app;
  McpServer server(app.fetch(), "1.0", "t");
  callTool(server, "put_draft", std::string(R"({"graph":)") + kGoodGraph + "}");
  callTool(server, "set_control", R"({"control":"Brightness","value":0.5})");

  // Some clients send every value as text.
  const json text = callTool(server, "set_control", R"({"control":"Brightness","value":"1.0"})")["result"];
  CHECK(text["isError"] == false);
  CHECK(app.draft->at("nodes")[0]["params"]["b"] == 1.0);
  CHECK(app.draft->at("nodes")[0]["params"]["b"].is_number());

  const json bad = callTool(server, "set_control", R"({"control":"Brightness","value":"loud"})")["result"];
  CHECK(bad["isError"] == true);
  CHECK(bad["content"][0]["text"].get<std::string>().find("number") != std::string::npos);
  CHECK(app.draft->at("nodes")[0]["params"]["b"] == 1.0);

  const json trailing = callTool(server, "set_control", R"({"control":"Brightness","value":"2x"})")["result"];
  CHECK(trailing["isError"] == true);
  CHECK(app.draft->at("nodes")[0]["params"]["b"] == 1.0);
}

TEST_CASE("set_control takes the kind from the node type when the draft has not set the param")
{
  FakeDrafts app;
  McpServer server(app.fetch(), "1.0", "t");
  callTool(server, "put_draft", R"({"graph":{"version":1,"nodes":[{"id":"q","type":"test.kinds","params":{}}],"edges":[],
    "controls":[{"node":"q","param":"width","label":"Width"},{"node":"q","param":"seed","label":"Seed"},
                {"node":"q","param":"clamp","label":"Clamp"},{"node":"q","param":"shape","label":"Shape"}]}})");
  const auto params = [&]() -> const json& { return app.draft->at("nodes")[0]["params"]; };

  CHECK(callTool(server, "set_control", R"({"control":"Width","value":"64"})")["result"]["isError"] == false);
  CHECK(params()["width"] == 64.0);
  CHECK(params()["width"].is_number());
  // A real number still works afterwards: the earlier string was never saved as a string.
  CHECK(callTool(server, "set_control", R"({"control":"Width","value":32})")["result"]["isError"] == false);
  CHECK(params()["width"] == 32.0);

  CHECK(callTool(server, "set_control", R"({"control":"Width","value":"wide"})")["result"]["isError"] == true);
  CHECK(params()["width"] == 32.0);

  CHECK(callTool(server, "set_control", R"({"control":"Seed","value":"0.5"})")["result"]["isError"] == false);
  CHECK(params()["seed"] == 0.5);
  CHECK(callTool(server, "set_control", R"({"control":"Seed","value":null})")["result"]["isError"] == false);

  CHECK(callTool(server, "set_control", R"({"control":"Clamp","value":"false"})")["result"]["isError"] == false);
  CHECK(params()["clamp"] == false);
  CHECK(params()["clamp"].is_boolean());
  CHECK(callTool(server, "set_control", R"({"control":"Clamp","value":"yes"})")["result"]["isError"] == true);
  CHECK(params()["clamp"] == false);

  CHECK(callTool(server, "set_control", R"({"control":"Shape","value":"sine"})")["result"]["isError"] == false);
  CHECK(params()["shape"] == "sine");
  CHECK(callTool(server, "set_control", R"({"control":"Shape","value":3})")["result"]["isError"] == true);
  CHECK(params()["shape"] == "sine");
}

TEST_CASE("preview tells a static graph from a reacting one")
{
  FakeDrafts app;
  McpServer server(app.fetch(), "1.0", "t");

  CHECK(callTool(server, "preview")["result"]["isError"] == true);

  callTool(server, "put_draft", std::string(R"({"graph":)") + kGoodGraph + "}");
  const json still = callTool(server, "preview")["result"];
  CHECK(still["isError"] == false);
  CHECK(still["structuredContent"]["reacting"] == false);
  CHECK(still["structuredContent"]["outputs"][0]["reacting"] == false);

  app.previewBody = R"({"session":"t","seconds":1,"samples":4,"outputs":[{"output":"hue","change":0.08,"zones":[]}],"errors":[]})";
  const json moving = callTool(server, "preview", R"({"seconds":2})")["result"];
  CHECK(moving["structuredContent"]["reacting"] == true);
  CHECK(app.log.back() == "GET /api/graph/preview/summary?session=t&seconds=2.000000");
  CHECK_FALSE(moving["structuredContent"].contains("note"));
}

TEST_CASE("preview of a draft that sent no colors says to play audio and try again")
{
  FakeDrafts app;
  McpServer server(app.fetch(), "1.0", "t");
  callTool(server, "put_draft", std::string(R"({"graph":)") + kGoodGraph + "}");

  app.previewBody = R"({"session":"t","seconds":3,"samples":46,"outputs":[],"errors":[]})";
  const json quiet = callTool(server, "preview")["result"];
  CHECK(quiet["isError"] == false);
  CHECK(quiet["structuredContent"]["reacting"] == false);
  CHECK(quiet["structuredContent"]["note"].get<std::string>().find("play something") != std::string::npos);
}

TEST_CASE("shutdown deletes the draft, and only when one was saved")
{
  FakeDrafts app;
  McpServer idle(app.fetch(), "1.0", "t");
  idle.shutdown();
  CHECK(app.log.empty());

  McpServer server(app.fetch(), "1.0", "t");
  callTool(server, "put_draft", R"({"graph":{"version":1}})");
  REQUIRE(app.draft.has_value());
  server.shutdown();
  CHECK_FALSE(app.draft.has_value());
  CHECK(app.log.back() == "DELETE /api/graph/drafts/t");
}


namespace
{
  // The light-test and apply routes over one draft. The heartbeat thread calls it too.
  struct FakeLights
  {
    std::mutex mutex;
    std::vector<std::string> log;
    bool testing{false};
    int heartbeats{0};
    int heartbeatStatus{200};
    std::string active{"builtin-video"};
    std::string running{"builtin-video"};
    std::string previewDraftChanged;

    Fetch fetch()
    {
      return [this](const std::string& method, const std::string& path, const std::string& body){
        std::lock_guard<std::mutex> lock(mutex);
        log.push_back(method + " " + path);
        if(method == "GET" && path == "/api/effects"){
          return HttpReply{200, json{{"activeEffectId", active}}.dump(), {}};
        }
        if(method == "POST" && path == "/api/graph/test"){
          testing = true;
          return HttpReply{200, R"({"succeeded":true,"confirmWithinMs":120000,"heartbeatMs":20,"revertAfterMs":6000})", {}};
        }
        if(method == "POST" && path == "/api/graph/test/heartbeat"){
          ++heartbeats;
          return HttpReply{heartbeatStatus, "{}", {}};
        }
        if(method == "POST" && path == "/api/graph/test/revert"){
          const bool was = testing;
          testing = false;
          return was ? HttpReply{200, R"({"succeeded":true})", {}} : HttpReply{404, "{}", {}};
        }
        if(method == "POST" && (path == "/api/graph/test/confirm" || path == "/api/graph/apply")){
          if(path.find("confirm") != std::string::npos && !testing){
            return HttpReply{404, "{}", {}};
          }
          const std::string id = json::parse(body).at("id");
          testing = false;
          active = id;
          return HttpReply{200, json{{"succeeded", true}, {"effect", running == "fallback" ? "builtin-video" : id},
            {"requestedEffect", id}}.dump(), {}};
        }
        if(method == "PUT" && path == "/api/effects"){
          active = json::parse(body).at("activeEffectId");
          return HttpReply{200, json{{"succeeded", true}, {"effect", active}}.dump(), {}};
        }
        return HttpReply{404, "{}", {}};
      };
    }

    int beats()
    {
      std::lock_guard<std::mutex> lock(mutex);
      return heartbeats;
    }
  };

  bool waitFor(const std::function<bool()>& done)
  {
    for(int i = 0; i < 200 && !done(); ++i){
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    return done();
  }
}

TEST_CASE("try_on_lights heartbeats until keep, which applies and stops the beat")
{
  FakeLights app;
  McpServer server(app.fetch(), "1.0", "t");

  const json started = callTool(server, "try_on_lights")["result"];
  CHECK(started["isError"] == false);
  CHECK(started["structuredContent"]["started"] == true);
  CHECK(waitFor([&app]{ return app.beats() >= 3; }));

  const json kept = callTool(server, "keep", R"({"id":"aurora-1"})")["result"];
  CHECK(kept["isError"] == false);
  CHECK(kept["structuredContent"]["applied"] == true);
  CHECK(app.active == "aurora-1");

  const int after = app.beats();
  std::this_thread::sleep_for(std::chrono::milliseconds(80));
  CHECK(app.beats() == after);
}

TEST_CASE("Closing the adapter mid-test reverts the lights")
{
  FakeLights app;
  McpServer server(app.fetch(), "1.0", "t");
  callTool(server, "try_on_lights");
  REQUIRE(waitFor([&app]{ return app.beats() >= 1; }));

  server.shutdown();
  CHECK_FALSE(app.testing);
  CHECK(app.log.back() == "POST /api/graph/test/revert");
}

TEST_CASE("revert ends the test, and reports one that already ended")
{
  FakeLights app;
  McpServer server(app.fetch(), "1.0", "t");
  callTool(server, "try_on_lights");

  CHECK(callTool(server, "revert")["result"]["structuredContent"]["reverted"] == true);
  CHECK_FALSE(app.testing);
  const json again = callTool(server, "revert")["result"];
  CHECK(again["isError"] == false);
  CHECK(again["structuredContent"]["reverted"] == false);
}

TEST_CASE("keep after the test ended is an error that says it ended")
{
  FakeLights app;
  McpServer server(app.fetch(), "1.0", "t");
  const json result = callTool(server, "keep", R"({"id":"aurora-1"})")["result"];
  CHECK(result["isError"] == true);
  CHECK(result["content"][0]["text"].get<std::string>().find("try_on_lights") != std::string::npos);
}

TEST_CASE("apply names the effect, a fallback is a failure")
{
  FakeLights app;
  McpServer server(app.fetch(), "1.0", "t");

  const json ok = callTool(server, "apply", R"({"id":"aurora-1"})")["result"];
  CHECK(ok["isError"] == false);
  CHECK(ok["structuredContent"]["effect"] == "aurora-1");

  app.running = "fallback";
  const json failed = callTool(server, "apply", R"({"id":"aurora-2"})")["result"];
  CHECK(failed["isError"] == true);
  CHECK(failed["structuredContent"]["applied"] == false);
  CHECK(failed["structuredContent"]["effect"] == "builtin-video");

  CHECK(callTool(server, "apply", "{}")["result"]["isError"] == true);
  CHECK(callTool(server, "apply", R"({"id":"../x"})")["result"]["isError"] == true);
}

TEST_CASE("revert_effect restores what ran before the first apply")
{
  FakeLights app;
  McpServer server(app.fetch(), "1.0", "t");
  CHECK(callTool(server, "revert_effect")["result"]["isError"] == true);

  app.active = "builtin-audio";
  callTool(server, "apply", R"({"id":"aurora-1"})");
  callTool(server, "apply", R"({"id":"aurora-2"})");
  REQUIRE(app.active == "aurora-2");

  const json restored = callTool(server, "revert_effect")["result"];
  CHECK(restored["isError"] == false);
  CHECK(app.active == "builtin-audio");
}

TEST_CASE("A test that ended on Aurora's side stops the heartbeat thread")
{
  FakeLights app;
  app.heartbeatStatus = 404;
  McpServer server(app.fetch(), "1.0", "t");
  callTool(server, "try_on_lights");

  REQUIRE(waitFor([&app]{ return app.beats() >= 1; }));
  std::this_thread::sleep_for(std::chrono::milliseconds(80));
  CHECK(app.beats() == 1);
}

TEST_CASE("A graph that needs an unchosen input asks for the user, not a retry")
{
  const std::string missing = R"({"succeeded":false,"error":"cannot_test","message":"graph needs an audio input but none is configured"})";
  McpServer test(scripted({{"POST /api/graph/test", {409, missing, {}}}}), "1.0", "t");
  const json tried = callTool(test, "try_on_lights")["result"];
  CHECK(tried["isError"] == true);
  CHECK(tried["content"][0]["text"].get<std::string>().find("ask the user") != std::string::npos);

  McpServer preview(scripted({{"/api/graph/preview/summary?session=t",
    {422, R"({"error":"cannot_preview","message":"graph needs an audio input but none is configured"})", {}}}}), "1.0", "t");
  CHECK(callTool(preview, "preview")["result"]["content"][0]["text"].get<std::string>().find("ask the user") != std::string::npos);

  McpServer busy(scripted({{"POST /api/graph/test", {409, R"({"message":"pipeline is rebuilding"})", {}}}}), "1.0", "t");
  CHECK(callTool(busy, "try_on_lights")["result"]["content"][0]["text"].get<std::string>().find("Try again") != std::string::npos);
}

TEST_CASE("aurora-mcp --pair requests the scope, prints only the token, and tells deny from expiry")
{
  std::vector<std::string> log;
  std::vector<HttpReply> polls;
  std::string requestBody;
  const Fetch fetch = [&](const std::string& method, const std::string& path, const std::string& body){
    log.push_back(method + " " + path);
    if(method == "POST"){
      requestBody = body;
      return HttpReply{202, R"({"pollKey":"pk","code":"K7Q2X"})", {}};
    }
    HttpReply next = polls.front();
    polls.erase(polls.begin());
    return next;
  };

  SECTION("Approved after a pending poll"){
    polls = {{202, R"({"state":"pending"})", {}}, {200, R"({"state":"approved","token":"tok123","scope":"apply"})", {}}};
    std::ostringstream out, err;
    int waits = 0;
    CHECK(Aurora::Mcp::pair(fetch, "laptop", "apply", out, err, [&]{ ++waits; }) == 0);
    CHECK(out.str() == "tok123\n");
    CHECK(err.str().find("K7Q2X") != std::string::npos);
    CHECK(json::parse(requestBody) == json{{"name", "laptop"}, {"scope", "apply"}});
    CHECK(log == std::vector<std::string>{"POST /api/pairing/request", "GET /api/pairing/request/pk", "GET /api/pairing/request/pk"});
    CHECK(waits == 2);
  }

  SECTION("Slow down keeps waiting"){
    polls = {{429, R"({"error":"slow_down"})", {}}, {200, R"({"state":"approved","token":"tok123","scope":"apply"})", {}}};
    std::ostringstream out, err;
    CHECK(Aurora::Mcp::pair(fetch, "laptop", "apply", out, err, []{}) == 0);
    CHECK(out.str() == "tok123\n");
  }

  SECTION("Denied says denied"){
    polls = {{403, R"({"error":"access_denied"})", {}}};
    std::ostringstream out, err;
    CHECK(Aurora::Mcp::pair(fetch, "laptop", "draft", out, err, []{}) == 1);
    CHECK(out.str().empty());
    CHECK(err.str().find("denied") != std::string::npos);
  }

  SECTION("Expired says expired"){
    polls = {{410, R"({"error":"expired_token"})", {}}};
    std::ostringstream out, err;
    CHECK(Aurora::Mcp::pair(fetch, "laptop", "draft", out, err, []{}) == 1);
    CHECK(out.str().empty());
    CHECK(err.str().find("expired") != std::string::npos);
    CHECK(err.str().find("denied") == std::string::npos);
  }

  SECTION("Admin is refused before any request"){
    std::ostringstream out, err;
    CHECK(Aurora::Mcp::pair(fetch, "laptop", "admin", out, err, []{}) == 2);
    CHECK(log.empty());
  }
}

TEST_CASE("isLoopbackUrl")
{
  using Aurora::Mcp::isLoopbackUrl;
  CHECK(isLoopbackUrl("http://127.0.0.1:8215"));
  CHECK(isLoopbackUrl("http://LOCALHOST:8215/"));
  CHECK(isLoopbackUrl("http://[::1]:8215"));
  CHECK_FALSE(isLoopbackUrl("http://192.168.1.20:8215"));
  CHECK_FALSE(isLoopbackUrl("http://aurora.local"));
}
