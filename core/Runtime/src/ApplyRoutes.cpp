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
      const std::string& session, const std::string& id, const std::string& client, nlohmann::json& body){
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
      ConfigStore(configRoot).update([&id, &client](Config& config){
        config.setActiveEffectId(id);
        if(client == kMcpClient){
          config.setMcpEffectId(id);
        }
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
        const int status = apply(session, id, req.client, body);
        _reply(res, status, body);
      }
    );
    // Tuning on a custom effect: set node params in effects/<id>.json, then
    // apply through the same swap. Nothing is written unless every edit lands
    // and the edited graph still validates.
    server.addRoute(
      HttpMethod::Put,
      "/api/effects/:id/params",
      [&pipelineHost, &registry, configRoot, nodes, coalescer](const Request& req, Response& res){
        const std::string& id = req.pathParams.at("id");
        if(!EffectStore::validId(id)){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_effect_id"}});
          return;
        }
        nlohmann::json edits;
        try{
          edits = nlohmann::json::parse(req.body).at("params");
        }
        catch(const nlohmann::json::exception&){
          edits = nullptr;
        }
        if(!edits.is_array() || edits.empty()){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }

        const EffectStore store(configRoot);
        std::string readError;
        auto doc = store.read(id, readError);
        if(!doc){
          _reply(res, store.exists(id) ? 422 : 404,
            {{"succeeded", false}, {"error", store.exists(id) ? "unreadable_effect" : "unknown_effect"}});
          return;
        }

        for(const nlohmann::json& edit : edits){
          const bool shaped = edit.is_object() && edit.contains("node") && edit["node"].is_string()
            && edit.contains("param") && edit["param"].is_string() && edit.contains("value");
          nlohmann::json* target = nullptr;
          if(shaped && doc->contains("nodes") && (*doc)["nodes"].is_array()){
            for(nlohmann::json& node : (*doc)["nodes"]){
              if(node.is_object() && node.value("id", "") == edit["node"].get<std::string>()){
                target = &node;
                break;
              }
            }
          }
          if(!target){
            _reply(res, 422, {{"succeeded", false}, {"error", "unknown_node"}, {"edit", edit}});
            return;
          }
          if(!target->contains("params") || !(*target)["params"].is_object()){
            (*target)["params"] = nlohmann::json::object();
          }
          (*target)["params"][edit["param"].get<std::string>()] = edit["value"];
        }

        nlohmann::json validation = validateGraphDoc(*nodes, registry, configRoot, *doc);
        if(!validation.at("valid").get<bool>()){
          validation["succeeded"] = false;
          validation["error"] = "invalid_graph";
          _reply(res, 422, validation);
          return;
        }

        std::string writeError;
        if(!store.write(id, *doc, writeError)){
          _reply(res, 500, {{"succeeded", false}, {"error", "write_failed"}, {"message", writeError}});
          return;
        }

        // A file that is not the active effect is saved, with nothing to apply.
        nlohmann::json body{{"succeeded", true}, {"id", id}};
        if(ConfigStore(configRoot).load().customEffectId() == id){
          const std::string applyError = coalescer->submit();
          if(!applyError.empty()){
            body["reloadError"] = applyError;
          }
        }
        const PipelineSummary summary = pipelineHost.summary();
        body["effect"] = _idOrNull(summary.effect);
        body["requestedEffect"] = _idOrNull(summary.requestedEffect);
        _reply(res, 200, body);
      }
    );

    return apply;
  }
}
