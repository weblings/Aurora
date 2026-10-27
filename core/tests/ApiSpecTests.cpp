#include <fstream>
#include <memory>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include <catch2/catch_test_macros.hpp>
#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/PublicApiRoutes.hpp>
#include <Aurora/Runtime/Registry.hpp>

using namespace Aurora::Network::Http::Server;


namespace
{
  const std::string kV1Prefix = "/api/v1/";

  nlohmann::json loadSpec()
  {
    std::ifstream file(AURORA_OPENAPI_JSON);
    REQUIRE(file.good());
    return nlohmann::json::parse(file);
  }

  const char* methodKey(HttpMethod method)
  {
    switch(method){
      case HttpMethod::Get: return "get";
      case HttpMethod::Post: return "post";
      case HttpMethod::Put: return "put";
      case HttpMethod::Delete: return "delete";
      case HttpMethod::Patch: return "patch";
    }
    return "";
  }

  // Routes use ":id", the spec uses "{id}".
  std::string toSpecPath(const std::string& path)
  {
    std::string out;
    for(size_t i = 0; i < path.size(); ++i){
      if(path[i] != ':'){
        out += path[i];
        continue;
      }
      size_t end = path.find('/', i);
      if(end == std::string::npos){
        end = path.size();
      }
      out += '{' + path.substr(i + 1, end - i - 1) + '}';
      i = end - 1;
    }
    return out;
  }

  // An unpaired remote caller gets through only on an open (Scope::None) rule.
  bool isOpen(const AccessGuard& guard, HttpMethod method, const std::string& path)
  {
    AccessRequest request;
    request.method = method;
    request.path = path;
    request.remoteAddr = "192.168.1.50";
    return guard.decide(request).result == AccessDecision::Result::Allow;
  }

  // Empty when the routes and the spec agree, else one line per mismatch.
  std::vector<std::string> compare(const std::vector<RouteInfo>& routes, const AccessGuard& guard, const nlohmann::json& spec)
  {
    std::vector<std::string> problems;
    std::set<std::string> seen;
    const nlohmann::json& paths = spec.at("paths");

    for(const auto& route : routes){
      if(route.path.rfind(kV1Prefix, 0) != 0){
        continue;
      }
      const std::string specPath = toSpecPath(route.path);
      const std::string label = std::string(methodKey(route.method)) + " " + specPath;
      seen.insert(label);

      if(!paths.contains(specPath) || !paths.at(specPath).contains(methodKey(route.method))){
        problems.push_back("route without spec operation: " + label);
        continue;
      }
      const auto& operation = paths.at(specPath).at(methodKey(route.method));
      const bool specOpen = operation.contains("security") && operation.at("security").empty();
      if(specOpen != isOpen(guard, route.method, route.path)){
        problems.push_back("security mismatch: " + label);
      }
    }

    for(const auto& [specPath, item] : paths.items()){
      for(const auto& [key, operation] : item.items()){
        if(seen.count(key + " " + specPath) == 0){
          problems.push_back("spec operation without route: " + key + " " + specPath);
        }
      }
    }
    return problems;
  }

  AccessGuard makeGuard()
  {
    return AccessGuard(std::make_shared<PairingService>());
  }

  const auto kNoop = [](const Request&, Response&){};
}


TEST_CASE("the spec is OpenAPI 3.2 at apiVersion 1.0.0", "[api-spec]")
{
  const nlohmann::json spec = loadSpec();
  CHECK(spec.at("openapi").get<std::string>().rfind("3.2", 0) == 0);
  CHECK(spec.at("info").at("version") == "1.0.0");
}

TEST_CASE("every /api/v1 route has a spec operation and the reverse", "[api-spec]")
{
  const nlohmann::json spec = loadSpec();
  HttpServer server;
  // Each v1 bead registers its routes here as it lands. The handlers are
  // never called, so an idle host and an empty registry are enough.
  Aurora::Runtime::PipelineHost host(nullptr, {});
  Aurora::Runtime::Registry registry;
  Aurora::Runtime::DescriptorRegistry descriptors;
  Aurora::Runtime::registerPublicApiRoutes(server, host, registry, std::filesystem::temp_directory_path(),
    nullptr, nullptr, nullptr, {"test", "dev", false, true, &descriptors});

  const auto problems = compare(server.routeList(), makeGuard(), spec);
  for(const auto& problem : problems){
    UNSCOPED_INFO(problem);
  }
  CHECK(problems.empty());
}

TEST_CASE("the route walk flags a missing operation, a stray one and a security mismatch", "[api-spec]")
{
  const nlohmann::json spec = nlohmann::json::parse(R"({
    "paths": {
      "/api/v1/version": {"get": {"security": []}},
      "/api/v1/effects/{id}": {"get": {}},
      "/api/v1/stray": {"get": {}}
    }
  })");

  AccessGuard guard = makeGuard();
  guard.addRule("/api/v1/version", Scope::None);

  HttpServer server;
  server.addRoute(HttpMethod::Get, "/api/v1/version", kNoop);
  server.addRoute(HttpMethod::Get, "/api/v1/effects/:id", kNoop);
  server.addRoute(HttpMethod::Post, "/api/v1/unlisted", kNoop);
  server.addRoute(HttpMethod::Get, "/api/state", kNoop);

  const auto problems = compare(server.routeList(), guard, spec);
  REQUIRE(problems.size() == 2);
  CHECK(problems[0] == "route without spec operation: post /api/v1/unlisted");
  CHECK(problems[1] == "spec operation without route: get /api/v1/stray");

  guard.addRule("/api/v1/effects", Scope::None);
  const auto mismatches = compare(server.routeList(), guard, spec);
  REQUIRE(mismatches.size() == 3);
  CHECK(mismatches[0] == "security mismatch: get /api/v1/effects/{id}");
}
