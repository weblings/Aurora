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


  ApplyDraftFn registerApplyRoutes(
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

    ApplyDraftFn apply = [&pipelineHost, &registry, configRoot, drafts, nodes, coalescer](
      const std::string& session, const std::string& id, nlohmann::json& body){
      if(!DraftStore::validSession(session)){
        body = {{"succeeded", false}, {"error", "invalid_session"}};
        return 400;
      }
      if(!EffectStore::validId(id)){
        body = {{"succeeded", false}, {"error", "invalid_effect_id"}};
        return 400;
      }
      auto draft = drafts->get(session);
      if(!draft){
        body = {{"succeeded", false}, {"error", "no_draft"}};
        return 404;
      }

      nlohmann::json validation = validateGraphDoc(*nodes, registry, configRoot, *draft);
      if(!validation.at("valid").get<bool>()){
        validation["succeeded"] = false;
        validation["error"] = "invalid_graph";
        body = std::move(validation);
        return 422;
      }

      std::string writeError;
      if(!EffectStore(configRoot).write(id, *draft, writeError)){
        body = {{"succeeded", false}, {"error", "write_failed"}, {"message", writeError}};
        return 500;
      }
      ConfigStore(configRoot).update([&id](Config& config){
        config.setActiveEffectId(id);
        return true;
      });

      const std::string applyError = coalescer->submit();
      const PipelineSummary summary = pipelineHost.summary();
      body = {
        {"succeeded", true},
        {"id", id},
        {"activeEffectId", id},
        {"effect", _idOrNull(summary.effect)},
        {"requestedEffect", _idOrNull(summary.requestedEffect)}
      };
      if(!applyError.empty()){
        body["reloadError"] = applyError;
      }
      return 200;
    };

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/apply",
      [apply](const Request& req, Response& res){
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
        nlohmann::json body;
        const int status = apply(session, id, body);
        _reply(res, status, body);
      }
    );
    return apply;
  }
}
