#include <Aurora/Runtime/ControlDescriptors.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;


  void registerDescriptorRoutes(
    HttpServer& server,
    const DescriptorRegistry& registry
  )
  {
    const nlohmann::json payload = registry.toJson();
    server.addRoute(HttpMethod::Get, "/api/descriptors", [payload](const Request&, Response& res){
      res.status = 200;
      res.contentType = "application/json";
      res.body = payload.dump();
    });
  }
}
