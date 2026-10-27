#include <cmath>

#include <Aurora/Runtime/PublicApiRoutes.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/EffectsRoutes.hpp>
#include <Aurora/Runtime/HostRoutes.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::EventStream;
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;

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
    Aurora::Network::Http::Server::AccessGuard*,
    PublicApiInfo info
  )
  {
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
