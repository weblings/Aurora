#include <Aurora/Runtime/EffectsRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/Registry.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::AccessGuard;
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;
  using Aurora::Network::Http::Server::Scope;

  namespace
  {
    void _reply(Response& res, int status, const nlohmann::json& body)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = body.dump();
    }

    nlohmann::json _idOrNull(const std::string& id)
    {
      return id.empty() ? nlohmann::json(nullptr) : nlohmann::json(id);
    }

    // The effect state the answers report, read after any reload.
    nlohmann::json _effectState(PipelineHost& pipelineHost, nlohmann::json body)
    {
      const PipelineSummary summary = pipelineHost.summary();
      body["effect"] = _idOrNull(summary.effect);
      body["requestedEffect"] = _idOrNull(summary.requestedEffect);
      return body;
    }

    // Same output choice Pipeline::build makes.
    std::vector<std::string> _outputNames(const Registry& registry, const Config& config)
    {
      std::vector<std::string> names = config.activeOutputNames();
      return names.empty() ? registry.outputNames() : names;
    }
  }


  void addEffectsAccessRules(AccessGuard& guard)
  {
    guard.addWriteRule("/api/effects", Scope::Apply);
  }


  void registerEffectsRoutes(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::function<std::string()> onConfigChanged,
    AccessGuard* guard
  )
  {
    if(guard){
      addEffectsAccessRules(*guard);
    }

    server.addRoute(
      HttpMethod::Get,
      "/api/effects",
      [&pipelineHost, configRoot](const Request&, Response& res){
        nlohmann::json effects = nlohmann::json::array();
        effects.push_back({{"id", kBuiltInVideoEffectId}, {"builtin", true}});
        effects.push_back({{"id", kBuiltInAudioEffectId}, {"builtin", true}});
        for(const std::string& id : EffectStore(configRoot).list()){
          effects.push_back({{"id", id}, {"builtin", false}});
        }
        _reply(res, 200, _effectState(pipelineHost, {
          {"effects", effects},
          {"activeEffectId", ConfigStore(configRoot).load().activeEffectId()}
        }));
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/effects/:id",
      [&registry, configRoot](const Request& req, Response& res){
        const std::string& id = req.pathParams.at("id");
        if(isBuiltInEffectId(id)){
          const Config config = ConfigStore(configRoot).load();
          const auto names = _outputNames(registry, config);
          const bool audio = id == kBuiltInAudioEffectId;
          const auto graph = audio
            ? Graph::builtInAudioGraph(names, Graph::audioOverlayFromConfig(config.data(), names))
            : Graph::builtInVideoGraph(names, Graph::videoOverlayFromConfig(config.data(), names));
          _reply(res, 200, {{"id", id}, {"builtin", true}, {"graph", graph}});
          return;
        }

        const EffectStore store(configRoot);
        if(!store.exists(id)){
          _reply(res, 404, {{"error", "unknown_effect"}});
          return;
        }
        std::string error;
        auto doc = store.read(id, error);
        if(!doc){
          _reply(res, 422, {{"error", "unreadable_effect"}, {"message", error}});
          return;
        }
        _reply(res, 200, {{"id", id}, {"builtin", false}, {"graph", *doc}});
      }
    );

    server.addRoute(
      HttpMethod::Put,
      "/api/effects",
      [&pipelineHost, configRoot, onConfigChanged](const Request& req, Response& res){
        std::string id;
        try{
          id = nlohmann::json::parse(req.body).at("activeEffectId").get<std::string>();
        }
        catch(const nlohmann::json::exception&){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        if(!id.empty() && !isBuiltInEffectId(id) && !EffectStore(configRoot).exists(id)){
          _reply(res, 404, {{"succeeded", false}, {"error", "unknown_effect"}});
          return;
        }

        ConfigStore(configRoot).update([&id](Config& config){
          config.setActiveEffectId(id);
          return true;
        });
        const std::string reloadError = onConfigChanged ? onConfigChanged() : std::string{};

        nlohmann::json body = _effectState(pipelineHost, {{"succeeded", true}, {"activeEffectId", id}});
        if(!reloadError.empty()){
          body["reloadError"] = reloadError;
        }
        _reply(res, 200, body);
      }
    );

    server.addRoute(
      HttpMethod::Delete,
      "/api/effects/:id",
      [configRoot, onConfigChanged](const Request& req, Response& res){
        const std::string& id = req.pathParams.at("id");
        if(isBuiltInEffectId(id)){
          _reply(res, 400, {{"succeeded", false}, {"error", "builtin_effect"}});
          return;
        }
        const EffectStore store(configRoot);
        if(!store.exists(id)){
          _reply(res, 404, {{"succeeded", false}, {"error", "unknown_effect"}});
          return;
        }

        // Clear the setting before the file goes, so a crash in between never
        // leaves the config naming a missing graph.
        bool wasActive = false;
        ConfigStore(configRoot).update([&](Config& config){
          wasActive = config.customEffectId() == id;
          if(wasActive){
            config.setActiveEffectId("");
          }
          return wasActive;
        });
        store.remove(id);

        nlohmann::json body{{"succeeded", true}, {"deleted", id}, {"fellBack", wasActive}};
        if(wasActive && onConfigChanged){
          const std::string reloadError = onConfigChanged();
          if(!reloadError.empty()){
            body["reloadError"] = reloadError;
          }
        }
        _reply(res, 200, body);
      }
    );
  }
}
