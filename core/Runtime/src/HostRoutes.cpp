#include <algorithm>
#include <utility>
#include <vector>

#include <Aurora/Runtime/HostRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/Registry.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;


  void registerCapabilitiesRoute(
    HttpServer& server,
    const Registry& registry,
    const PipelineHost& pipelineHost,
    std::string platform,
    bool hueCompiledIn,
    bool canSelectMonitor
  )
  {
    server.addRoute(
      HttpMethod::Get,
      "/api/capabilities",
      [&registry, &pipelineHost, platform = std::move(platform), hueCompiledIn, canSelectMonitor](const Request&, Response& res){
        std::vector<std::string> outputs = registry.outputNames();
        if(hueCompiledIn && std::find(outputs.begin(), outputs.end(), "hue") == outputs.end()){
          outputs.push_back("hue");
        }
        nlohmann::json json = {
          {"inputs", registry.inputNames()},
          {"audioInputs", registry.audioInputNames()},
          {"outputs", outputs},
          // Outputs where brightness 0 means off; the Dashboard shows the floor control only for these.
          {"zeroOffOutputs", registry.zeroOffOutputNames()},
          {"platform", platform},
          {"canSelectMonitor", canSelectMonitor},
          // In-memory pause (Aurora-3ddb); read lock-free like the rest.
          {"paused", pipelineHost.isPaused()}
        };

        res.contentType = "application/json";
        res.body = json.dump();
      }
    );
  }


  void registerVersionRoute(HttpServer& server, std::string version)
  {
    server.addRoute(
      HttpMethod::Get,
      "/api/version",
      [version = std::move(version)](const Request&, Response& res){
        res.contentType = "application/json";
        res.body = nlohmann::json{{"version", version}}.dump();
      }
    );
  }


  void registerStopRoute(HttpServer& server, std::function<void()> requestStop)
  {
    server.addRoute(
      HttpMethod::Post,
      "/api/stop",
      [requestStop = std::move(requestStop)](const Request&, Response& res){
        res.contentType = "application/json";
        res.body = nlohmann::json{{"succeeded", true}}.dump();
        requestStop();
      }
    );
  }
}
