#include <Aurora/Runtime/TestRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/DraftRoutes.hpp>
#include <Aurora/Runtime/DraftStore.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
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
    constexpr std::uint64_t kPaused = ~std::uint64_t{0};

    void _reply(Response& res, int status, const nlohmann::json& body)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = body.dump();
    }

    // Parses the body and its session; false with the 400 already sent.
    bool _parseSession(const Request& req, Response& res, nlohmann::json& body, std::string& session)
    {
      try{
        body = nlohmann::json::parse(req.body);
        session = body.at("session").get<std::string>();
      }
      catch(const nlohmann::json::exception&){
        _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
        return false;
      }
      if(!DraftStore::validSession(session)){
        _reply(res, 400, {{"succeeded", false}, {"error", "invalid_session"}});
        return false;
      }
      return true;
    }
  }


  void addTestAccessRules(AccessGuard& guard)
  {
    guard.addWriteRule("/api/graph/test", Scope::Apply);
    guard.addWriteRule("/api/graph/test/stop", Scope::Admin);
  }


  std::shared_ptr<LightTest> registerTestRoutes(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<DraftStore> drafts,
    ApplyDraftFn applyDraft,
    AccessGuard* guard,
    LightTestOptions options,
    LightTest::Clock clock,
    bool watchdog
  )
  {
    if(guard){
      addTestAccessRules(*guard);
    }

    auto nodes = std::make_shared<Graph::NodeRegistry>();
    Graph::registerAllNodes(*nodes, true);

    LightTestHooks hooks;
    hooks.start = [&pipelineHost, &registry, configRoot](const nlohmann::json& doc) -> std::string {
      if(pipelineHost.testGraph(doc)){
        return {};
      }
      // Other inputs than the running ones: rebuild them, keep the outputs.
      std::string error;
      if(pipelineHost.reloadInputs(registry, ConfigStore(configRoot).load(), configRoot, &doc, error)){
        return {};
      }
      return error;
    };
    hooks.revert = [&pipelineHost, &registry, configRoot]() -> std::string {
      const Config live = ConfigStore(configRoot).load();
      const std::string id = live.customEffectId();
      std::optional<nlohmann::json> doc;
      std::string readError;
      if(!id.empty()){
        doc = EffectStore(configRoot).read(id, readError);
      }
      // An unreadable custom effect goes through the rebuild's fallback.
      if((id.empty() || doc) && pipelineHost.restoreEffect(live, doc)){
        return {};
      }
      std::string error;
      if(pipelineHost.reloadInputs(registry, live, configRoot, nullptr, error)){
        return {};
      }
      // Nothing running to rebuild (paused): the usual reload is a no-op then.
      return reloadPipelineFromDisk(pipelineHost, registry, configRoot);
    };
    hooks.generation = [&pipelineHost]() -> std::uint64_t {
      return pipelineHost.isPaused() ? kPaused : pipelineHost.buildEpoch();
    };

    auto test = std::make_shared<LightTest>(std::move(hooks), options, std::move(clock));
    if(watchdog){
      test->startWatchdog();
    }

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/test",
      [test, drafts, nodes, &registry, configRoot](const Request& req, Response& res){
        nlohmann::json body;
        std::string session;
        if(!_parseSession(req, res, body, session)){
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
        const std::string error = test->start(session, *draft);
        if(!error.empty()){
          _reply(res, 409, {{"succeeded", false}, {"error", "cannot_test"}, {"message", error}});
          return;
        }
        const LightTestOptions& o = test->options();
        _reply(res, 200, {
          {"succeeded", true},
          {"confirmWithinMs", o.confirmMs},
          {"heartbeatMs", o.heartbeatMs},
          {"revertAfterMs", o.lapseMs}
        });
      }
    );

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/test/heartbeat",
      [test](const Request& req, Response& res){
        nlohmann::json body;
        std::string session;
        if(!_parseSession(req, res, body, session)){
          return;
        }
        if(!test->heartbeat(session)){
          _reply(res, 404, {{"succeeded", false}, {"error", "no_test"}});
          return;
        }
        _reply(res, 200, {{"succeeded", true}, {"confirmRemainingMs", test->info().confirmRemainingMs}});
      }
    );

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/test/revert",
      [test](const Request& req, Response& res){
        nlohmann::json body;
        std::string session;
        if(!_parseSession(req, res, body, session)){
          return;
        }
        std::string error;
        if(!test->revert(session, error)){
          _reply(res, 404, {{"succeeded", false}, {"error", "no_test"}});
          return;
        }
        nlohmann::json out{{"succeeded", true}};
        if(!error.empty()){
          out["revertError"] = error;
        }
        _reply(res, 200, out);
      }
    );

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/test/stop",
      [test](const Request&, Response& res){
        std::string error;
        if(!test->stop(error)){
          _reply(res, 404, {{"succeeded", false}, {"error", "no_test"}});
          return;
        }
        nlohmann::json out{{"succeeded", true}};
        if(!error.empty()){
          out["revertError"] = error;
        }
        _reply(res, 200, out);
      }
    );

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/test/confirm",
      [test, drafts, applyDraft](const Request& req, Response& res){
        nlohmann::json body;
        std::string session;
        if(!_parseSession(req, res, body, session)){
          return;
        }
        std::string id;
        try{
          id = body.at("id").get<std::string>();
        }
        catch(const nlohmann::json::exception&){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        auto tested = test->testedGraph(session);
        if(!tested){
          _reply(res, 404, {{"succeeded", false}, {"error", "no_test"}});
          return;
        }
        auto draft = drafts->get(session);
        if(!draft || *draft != *tested){
          _reply(res, 409, {{"succeeded", false}, {"error", "draft_changed"}});
          return;
        }
        nlohmann::json out;
        const int status = applyDraft(session, id, req.client, out);
        if(status == 200){
          test->confirm(session);
        }
        _reply(res, status, out);
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/graph/test",
      [test](const Request&, Response& res){
        const LightTest::Info info = test->info();
        _reply(res, 200, {
          {"active", info.active},
          {"confirmRemainingMs", info.confirmRemainingMs},
          {"revertAfterMs", info.lapseRemainingMs},
          {"lastEnd", info.lastEnd.empty() ? nlohmann::json(nullptr) : nlohmann::json(info.lastEnd)}
        });
      }
    );

    return test;
  }
}
