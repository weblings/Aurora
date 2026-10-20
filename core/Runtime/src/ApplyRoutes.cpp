#include <Aurora/Runtime/ApplyRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/DraftRoutes.hpp>
#include <Aurora/Runtime/DraftStore.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/ReloadCoalescer.hpp>
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
  }


  void addApplyAccessRules(AccessGuard& guard)
  {
    guard.addWriteRule("/api/graph/apply", Scope::Apply);
  }


  void registerApplyRoutes(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<DraftStore> drafts,
    std::function<std::string()> applyLive,
    AccessGuard* guard
  )
  {
    if(guard){
      addApplyAccessRules(*guard);
    }

    auto nodes = std::make_shared<Graph::NodeRegistry>();
    Graph::registerAllNodes(*nodes, true);
    auto coalescer = std::make_shared<ReloadCoalescer>(std::move(applyLive));

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/apply",
      [&pipelineHost, &registry, configRoot, drafts, nodes, coalescer](const Request& req, Response& res){
        std::string session;
        std::string id;
        try{
          const nlohmann::json body = nlohmann::json::parse(req.body);
          session = body.at("session").get<std::string>();
          id = body.at("id").get<std::string>();
        }
        catch(const nlohmann::json::exception&){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        if(!DraftStore::validSession(session)){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_session"}});
          return;
        }
        if(!EffectStore::validId(id)){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_effect_id"}});
          return;
        }
        auto draft = drafts->get(session);
        if(!draft){
          _reply(res, 404, {{"succeeded", false}, {"error", "no_draft"}});
          return;
        }

        nlohmann::json validation = validateGraphDoc(*nodes, registry, configRoot, *draft);
        if(!validation.at("valid").get<bool>()){
          validation["succeeded"] = false;
          validation["error"] = "invalid_graph";
          _reply(res, 422, validation);
          return;
        }

        std::string writeError;
        if(!EffectStore(configRoot).write(id, *draft, writeError)){
          _reply(res, 500, {{"succeeded", false}, {"error", "write_failed"}, {"message", writeError}});
          return;
        }
        ConfigStore(configRoot).update([&id](Config& config){
          config.setActiveEffectId(id);
          return true;
        });

        const std::string applyError = coalescer->submit();
        const PipelineSummary summary = pipelineHost.summary();
        nlohmann::json body{
          {"succeeded", true},
          {"id", id},
          {"activeEffectId", id},
          {"effect", _idOrNull(summary.effect)},
          {"requestedEffect", _idOrNull(summary.requestedEffect)}
        };
        if(!applyError.empty()){
          body["reloadError"] = applyError;
        }
        _reply(res, 200, body);
      }
    );
  }
}
