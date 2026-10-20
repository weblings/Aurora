#include <Aurora/Runtime/DraftRoutes.hpp>

#include <optional>
#include <unordered_set>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
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

    // {"valid", "errors"} for one doc, against the outputs a load would use.
    nlohmann::json _validate(
      const Graph::NodeRegistry& nodes,
      const Registry& registry,
      const std::filesystem::path& configRoot,
      const nlohmann::json& doc)
    {
      const Config config = ConfigStore(configRoot).load();
      std::vector<std::string> names = config.activeOutputNames();
      if(names.empty()){
        names = registry.outputNames();
      }
      Graph::LoadOptions options;
      options.knownOutputs = std::unordered_set<std::string>(names.begin(), names.end());

      const Graph::LoadResult result = Graph::loadGraph(doc, nodes, options);
      nlohmann::json errors = nlohmann::json::array();
      for(const Graph::LoadIssue& issue : result.issues){
        errors.push_back({
          {"node", issue.node.empty() ? nlohmann::json(nullptr) : nlohmann::json(issue.node)},
          {"message", issue.message}
        });
      }
      return {{"valid", result.ok}, {"errors", errors}};
    }

    // The "graph" member of a request body, or nullopt when the body is not
    // JSON or the member is missing or not an object.
    std::optional<nlohmann::json> _graphFromBody(const std::string& body)
    {
      try{
        nlohmann::json parsed = nlohmann::json::parse(body);
        auto it = parsed.find("graph");
        if(it == parsed.end() || !it->is_object()){
          return std::nullopt;
        }
        return *it;
      }
      catch(const nlohmann::json::exception&){
        return std::nullopt;
      }
    }
  }


  void addDraftAccessRules(AccessGuard& guard)
  {
    guard.addWriteRule("/api/graph/drafts", Scope::Draft);
    guard.addWriteRule("/api/graph/validate", Scope::Draft);
  }


  std::shared_ptr<DraftStore> registerDraftRoutes(
    HttpServer& server,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    AccessGuard* guard,
    DraftLimits limits,
    DraftStore::Clock clock
  )
  {
    if(guard){
      addDraftAccessRules(*guard);
    }

    auto store = std::make_shared<DraftStore>(limits, std::move(clock));
    auto nodes = std::make_shared<Graph::NodeRegistry>();
    Graph::registerAllNodes(*nodes, true);

    server.addRoute(
      HttpMethod::Put,
      "/api/graph/drafts/:session",
      [store, nodes, &registry, configRoot](const Request& req, Response& res){
        const std::string& session = req.pathParams.at("session");
        if(!DraftStore::validSession(session)){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_session"}});
          return;
        }
        if(req.body.size() > store->limits().maxBytes){
          _reply(res, 413, {{"succeeded", false}, {"error", "draft_too_large"}});
          return;
        }
        auto graph = _graphFromBody(req.body);
        if(!graph){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        switch(store->put(session, *graph)){
          case DraftStore::PutResult::Saved:
            break;
          case DraftStore::PutResult::TooLarge:
            _reply(res, 413, {{"succeeded", false}, {"error", "draft_too_large"}});
            return;
          case DraftStore::PutResult::TooMany:
            _reply(res, 429, {{"succeeded", false}, {"error", "too_many_drafts"}});
            return;
          case DraftStore::PutResult::InvalidSession:
            _reply(res, 400, {{"succeeded", false}, {"error", "invalid_session"}});
            return;
        }
        nlohmann::json body = _validate(*nodes, registry, configRoot, *graph);
        body["succeeded"] = true;
        body["session"] = session;
        _reply(res, 200, body);
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/graph/drafts/:session",
      [store, nodes, &registry, configRoot](const Request& req, Response& res){
        const std::string& session = req.pathParams.at("session");
        if(!DraftStore::validSession(session)){
          _reply(res, 400, {{"error", "invalid_session"}});
          return;
        }
        auto draft = store->get(session);
        if(!draft){
          _reply(res, 404, {{"error", "no_draft"}});
          return;
        }
        nlohmann::json body = _validate(*nodes, registry, configRoot, *draft);
        body["session"] = session;
        body["graph"] = std::move(*draft);
        _reply(res, 200, body);
      }
    );

    server.addRoute(
      HttpMethod::Delete,
      "/api/graph/drafts/:session",
      [store](const Request& req, Response& res){
        const std::string& session = req.pathParams.at("session");
        if(!store->remove(session)){
          _reply(res, 404, {{"succeeded", false}, {"error", "no_draft"}});
          return;
        }
        _reply(res, 200, {{"succeeded", true}, {"deleted", session}});
      }
    );

    server.addRoute(
      HttpMethod::Post,
      "/api/graph/validate",
      [store, nodes, &registry, configRoot](const Request& req, Response& res){
        if(req.body.size() > store->limits().maxBytes){
          _reply(res, 413, {{"error", "draft_too_large"}});
          return;
        }
        auto graph = _graphFromBody(req.body);
        if(!graph){
          _reply(res, 400, {{"error", "invalid_body"}});
          return;
        }
        _reply(res, 200, _validate(*nodes, registry, configRoot, *graph));
      }
    );

    return store;
  }
}
