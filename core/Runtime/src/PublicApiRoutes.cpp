#include <cmath>

#include <Aurora/Runtime/PublicApiRoutes.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/EffectsRoutes.hpp>
#include <Aurora/Runtime/HostRoutes.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::AccessGuard;
  using Aurora::Network::Http::Server::EventStream;
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;
  using Aurora::Network::Http::Server::Scope;

  namespace
  {
    constexpr auto kHeartbeat = std::chrono::seconds(15);

    void _reply(Response& res, int status, const nlohmann::json& body)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = body.dump();
    }

    nlohmann::json _nameOrNull(const std::string& name)
    {
      return name.empty() ? nlohmann::json(nullptr) : nlohmann::json(name);
    }
  }


  namespace
  {
    struct Alias
    {
      HttpMethod method;
      const char* path;
    };

    // Paths below /api, an explicit list so internal siblings (graph/test/stop)
    // stay unversioned.
    constexpr Alias kAliases[] = {
      {HttpMethod::Put, "/graph/drafts/:session"},
      {HttpMethod::Get, "/graph/drafts/:session"},
      {HttpMethod::Delete, "/graph/drafts/:session"},
      {HttpMethod::Post, "/graph/validate"},
      {HttpMethod::Post, "/graph/test"},
      {HttpMethod::Get, "/graph/test"},
      {HttpMethod::Post, "/graph/test/heartbeat"},
      {HttpMethod::Post, "/graph/test/revert"},
      {HttpMethod::Post, "/graph/test/confirm"},
      {HttpMethod::Post, "/graph/apply"},
      {HttpMethod::Get, "/pairing/status"},
      {HttpMethod::Post, "/pairing/request"},
      {HttpMethod::Get, "/pairing/request/:pollKey"}
    };

    // Guard rules match path prefixes, so each v1 rule is copied from the
    // internal one by hand and a prefix copy of /api/graph is never made.
    void registerV1AliasRoutes(HttpServer& server, AccessGuard* guard)
    {
      if(guard){
        guard->addWriteRule("/api/v1/graph/drafts", Scope::Draft);
        guard->addWriteRule("/api/v1/graph/validate", Scope::Draft);
        guard->addWriteRule("/api/v1/graph/test", Scope::Apply);
        guard->addWriteRule("/api/v1/graph/test/stop", Scope::Admin);
        guard->addWriteRule("/api/v1/graph/apply", Scope::Apply);
        guard->addRule("/api/v1/pairing/status", Scope::None);
        guard->addRule("/api/v1/pairing/request", Scope::None);
      }
      for(const Alias& alias : kAliases){
        server.aliasRoute(alias.method, std::string("/api") + alias.path, std::string("/api/v1") + alias.path);
      }
    }
  }


  nlohmann::json v1StateToJson(const StateSnapshot& snapshot)
  {
    nlohmann::json state = stateToJson(snapshot);
    for(const char* internal : {"paused", "mcpEffectId", "canStop", "usesVideoInput", "usesAudioInput", "audioDevicesUrl"}){
      state.erase(internal);
    }
    state["brightness"] = std::round(snapshot.brightness * 10000.0) / 100.0;
    state["configuredInputs"] = {
      {"video", _nameOrNull(snapshot.activeInputName)},
      {"audio", _nameOrNull(snapshot.activeAudioInputName)}
    };
    return state;
  }


  void registerPublicApiRoutes(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<ReloadCoalescer>,
    std::shared_ptr<LightTest> lightTest,
    Aurora::Network::Http::Server::AccessGuard* guard,
    PublicApiInfo info
  )
  {
    registerV1AliasRoutes(server, guard);

    server.addRoute(
      HttpMethod::Get,
      "/api/v1/state",
      [&pipelineHost, configRoot, lightTest](const Request&, Response& res){
        _reply(res, 200, v1StateToJson(readStateSnapshot(pipelineHost, configRoot, lightTest)));
      }
    );

    server.addStreamRoute(
      "/api/v1/events",
      [&pipelineHost, configRoot, lightTest](const Request& req, EventStream& stream){
        EventPayloadBuilders builders;
        builders.state = [](const StateSnapshot& s){ return v1StateToJson(s); };
        builders.health = [](const StateSnapshot& s){
          const nlohmann::json state = v1StateToJson(s);
          return nlohmann::json{{"errors", state.at("errors")}, {"conditions", state.at("conditions")}};
        };
        runEventsStream(req, stream, pipelineHost, configRoot, kHeartbeat, lightTest, builders);
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/v1/capabilities",
      [&registry, platform = info.platform, hueCompiledIn = info.hueCompiledIn, canSelectMonitor = info.canSelectMonitor](const Request&, Response& res){
        _reply(res, 200, capabilitiesToJson(registry, platform, hueCompiledIn, canSelectMonitor));
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/v1/version",
      [version = info.appVersion](const Request&, Response& res){
        _reply(res, 200, {{"version", version}, {"apiVersion", kApiVersion}});
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/v1/effects",
      [&pipelineHost, configRoot](const Request&, Response& res){
        _reply(res, 200, effectsListToJson(pipelineHost, configRoot));
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/v1/effects/:id",
      [&registry, configRoot](const Request& req, Response& res){
        nlohmann::json body;
        const int status = effectDocumentToJson(registry, configRoot, req.pathParams.at("id"), body);
        _reply(res, status, body);
      }
    );

    if(info.descriptors){
      server.addRoute(
        HttpMethod::Get,
        "/api/v1/descriptors",
        [payload = info.descriptors->toJson()](const Request&, Response& res){
          _reply(res, 200, payload);
        }
      );
    }
  }
}
