#include <Aurora/Runtime/GraphRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/DraftRoutes.hpp>
#include <Aurora/Runtime/NodeCatalog.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;


  void registerNodesRoute(HttpServer& server)
  {
    const nlohmann::json payload = nodesPayload(nullptr);
    server.addRoute(HttpMethod::Get, "/api/nodes", [payload](const Request&, Response& res){
      res.contentType = "application/json";
      res.body = payload.dump();
    });
  }


  void registerNodesRoute(HttpServer& server, const Registry& registry, const std::filesystem::path& configRoot)
  {
    server.addRoute(HttpMethod::Get, "/api/nodes", [&registry, configRoot](const Request&, Response& res){
      const std::vector<std::string> outputs = graphOutputNames(registry, configRoot);
      res.contentType = "application/json";
      res.body = nodesPayload(&outputs).dump();
    });
  }


  void registerGraphRoute(HttpServer& server, PipelineHost& pipelineHost)
  {
    server.addRoute(HttpMethod::Get, "/api/graph", [&pipelineHost](const Request&, Response& res){
      auto graph = pipelineHost.graphJson();
      res.contentType = "application/json";
      res.body = nlohmann::json{{"graph", graph ? std::move(*graph) : nlohmann::json(nullptr)}}.dump();
    });
  }
}
