#include <Aurora/Runtime/EffectsRoutes.hpp>

#include <algorithm>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Runtime/ApplyRoutes.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/Registry.hpp>
#include <Aurora/Runtime/ReloadCoalescer.hpp>

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

    bool _contains(const std::vector<std::string>& ids, const std::string& id)
    {
      return std::find(ids.begin(), ids.end(), id) != ids.end();
    }

    // Ids in saved order first, the rest after in their given order.
    std::vector<std::string> _ordered(const std::vector<std::string>& ids, const std::vector<std::string>& saved)
    {
      std::vector<std::string> out;
      for(const std::string& id : saved){
        if(_contains(ids, id) && !_contains(out, id)){
          out.push_back(id);
        }
      }
      for(const std::string& id : ids){
        if(!_contains(out, id)){
          out.push_back(id);
        }
      }
      return out;
    }

    // Built-ins always lead, each group ordered by the saved order.
    std::vector<std::string> _displayOrder(const std::filesystem::path& configRoot, const Config& config)
    {
      std::vector<std::string> ids = _ordered({kBuiltInVideoEffectId, kBuiltInAudioEffectId}, config.effectOrder());
      const std::vector<std::string> customs = _ordered(EffectStore(configRoot).list(), config.effectOrder());
      ids.insert(ids.end(), customs.begin(), customs.end());
      return ids;
    }

    void _forget(Config& config, const std::string& id)
    {
      const auto drop = [&id](std::vector<std::string> ids){
        ids.erase(std::remove(ids.begin(), ids.end(), id), ids.end());
        return ids;
      };
      config.setHiddenEffectIds(drop(config.hiddenEffectIds()));
      config.setEffectOrder(drop(config.effectOrder()));
    }
  }


  nlohmann::json effectsListToJson(PipelineHost& pipelineHost, const std::filesystem::path& configRoot)
  {
    const Config config = ConfigStore(configRoot).load();
    nlohmann::json effects = nlohmann::json::array();
    int order = 0;
    for(const std::string& id : _displayOrder(configRoot, config)){
      const bool builtin = isBuiltInEffectId(id);
      const EffectInfo info = effectInfo(configRoot, id);
      effects.push_back({
        {"id", id}, {"builtin", builtin}, {"title", info.title},
        {"description", info.description.empty() ? nlohmann::json(nullptr) : nlohmann::json(info.description)},
        {"hidden", _contains(config.hiddenEffectIds(), id)}, {"order", order++}
      });
    }
    return _effectState(pipelineHost, {
      {"effects", effects},
      {"activeEffectId", config.activeEffectId()}
    });
  }


  int effectDocumentToJson(
    const Registry& registry,
    const std::filesystem::path& configRoot,
    const std::string& id,
    nlohmann::json& body
  )
  {
    if(isBuiltInEffectId(id)){
      const Config config = ConfigStore(configRoot).load();
      const auto names = _outputNames(registry, config);
      const bool audio = id == kBuiltInAudioEffectId;
      const auto graph = audio
        ? Graph::builtInAudioGraph(names, Graph::audioOverlayFromConfig(config.data(), names))
        : Graph::builtInVideoGraph(names, Graph::videoOverlayFromConfig(config.data(), names));
      body = {{"id", id}, {"builtin", true}, {"graph", graph}};
      return 200;
    }

    const EffectStore store(configRoot);
    if(!store.exists(id)){
      body = {{"error", "unknown_effect"}};
      return 404;
    }
    std::string error;
    auto doc = store.read(id, error);
    if(!doc){
      body = {{"error", "unreadable_effect"}, {"message", error}};
      return 422;
    }
    body = {{"id", id}, {"builtin", false}, {"graph", *doc}};
    return 200;
  }


  void addEffectsAccessRules(AccessGuard& guard)
  {
    guard.addWriteRule("/api/effects", Scope::Apply);
    // Delete is the one write that loses saved work, so it needs more than apply.
    guard.addMethodRule(HttpMethod::Delete, "/api/effects/", Scope::Admin);
  }


  void registerEffectsRoutes(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<ReloadCoalescer> reload,
    std::function<void()> onEffectChosen,
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
        _reply(res, 200, effectsListToJson(pipelineHost, configRoot));
      }
    );

    server.addRoute(
      HttpMethod::Get,
      "/api/effects/:id",
      [&registry, configRoot](const Request& req, Response& res){
        nlohmann::json body;
        const int status = effectDocumentToJson(registry, configRoot, req.pathParams.at("id"), body);
        _reply(res, status, body);
      }
    );

    server.addRoute(
      HttpMethod::Put,
      "/api/effects",
      [&pipelineHost, configRoot, reload, onEffectChosen](const Request& req, Response& res){
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

        const bool fromMcp = req.client == kMcpClient && !id.empty() && !isBuiltInEffectId(id);
        ConfigStore(configRoot).update([&id, fromMcp](Config& config){
          config.setActiveEffectId(id);
          if(fromMcp){
            config.setMcpEffectId(id);
          }
          return true;
        });
        const std::string reloadError = reload ? reload->submit() : std::string{};
        if(onEffectChosen){ onEffectChosen(); }

        nlohmann::json body = _effectState(pipelineHost, {{"succeeded", true}, {"activeEffectId", id}});
        if(!reloadError.empty()){
          body["reloadError"] = reloadError;
        }
        _reply(res, 200, body);
      }
    );

    // Copy any effect, built-in or custom, to a new custom id. Never replaces
    // a file, and never changes which effect is active.
    server.addRoute(
      HttpMethod::Post,
      "/api/effects/:id/duplicate",
      [&registry, configRoot](const Request& req, Response& res){
        std::string copyId;
        try{
          copyId = nlohmann::json::parse(req.body).at("id").get<std::string>();
        }
        catch(const nlohmann::json::exception&){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        if(!EffectStore::validId(copyId)){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_effect_id"}});
          return;
        }
        const EffectStore store(configRoot);
        if(store.exists(copyId)){
          _reply(res, 409, {{"succeeded", false}, {"error", "effect_exists"}});
          return;
        }

        const std::string& sourceId = req.pathParams.at("id");
        nlohmann::json source;
        const int status = effectDocumentToJson(registry, configRoot, sourceId, source);
        if(status != 200){
          source["succeeded"] = false;
          _reply(res, status, source);
          return;
        }
        std::string writeError;
        if(!store.write(copyId, source.at("graph"), writeError)){
          _reply(res, 500, {{"succeeded", false}, {"error", "write_failed"}, {"message", writeError}});
          return;
        }
        _reply(res, 200, {{"succeeded", true}, {"id", copyId}, {"source", sourceId}});
      }
    );

    // Hidden effects stay runnable, the picker just folds them away.
    server.addRoute(
      HttpMethod::Put,
      "/api/effects/:id/hidden",
      [configRoot](const Request& req, Response& res){
        bool hidden = false;
        try{
          hidden = nlohmann::json::parse(req.body).at("hidden").get<bool>();
        }
        catch(const nlohmann::json::exception&){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        const std::string& id = req.pathParams.at("id");
        if(!isBuiltInEffectId(id) && !EffectStore(configRoot).exists(id)){
          _reply(res, 404, {{"succeeded", false}, {"error", "unknown_effect"}});
          return;
        }
        ConfigStore(configRoot).update([&](Config& config){
          std::vector<std::string> ids = config.hiddenEffectIds();
          ids.erase(std::remove(ids.begin(), ids.end(), id), ids.end());
          if(hidden){
            ids.push_back(id);
          }
          config.setHiddenEffectIds(std::move(ids));
          return true;
        });
        _reply(res, 200, {{"succeeded", true}, {"id", id}, {"hidden", hidden}});
      }
    );

    // One step among the visible effects of the same group; hidden ones are skipped.
    server.addRoute(
      HttpMethod::Post,
      "/api/effects/:id/move",
      [configRoot](const Request& req, Response& res){
        int step = 0;
        try{
          const std::string direction = nlohmann::json::parse(req.body).at("direction").get<std::string>();
          step = direction == "up" ? -1 : direction == "down" ? 1 : 0;
        }
        catch(const nlohmann::json::exception&){}
        if(step == 0){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        const std::string& id = req.pathParams.at("id");
        if(!isBuiltInEffectId(id) && !EffectStore(configRoot).exists(id)){
          _reply(res, 404, {{"succeeded", false}, {"error", "unknown_effect"}});
          return;
        }

        bool moved = false;
        ConfigStore(configRoot).update([&](Config& config){
          std::vector<std::string> ids = _displayOrder(configRoot, config);
          const bool builtin = isBuiltInEffectId(id);
          const int from = static_cast<int>(std::find(ids.begin(), ids.end(), id) - ids.begin());
          int to = from + step;
          while(to >= 0 && to < static_cast<int>(ids.size())
            && isBuiltInEffectId(ids[to]) == builtin && _contains(config.hiddenEffectIds(), ids[to])){
            to += step;
          }
          if(to < 0 || to >= static_cast<int>(ids.size()) || isBuiltInEffectId(ids[to]) != builtin){
            return false;
          }
          ids.erase(ids.begin() + from);
          ids.insert(ids.begin() + to, id);
          config.setEffectOrder(std::move(ids));
          moved = true;
          return true;
        });
        _reply(res, 200, {{"succeeded", true}, {"id", id}, {"moved", moved}});
      }
    );

    // The title lives in the graph file; the id stays as first slugged.
    server.addRoute(
      HttpMethod::Put,
      "/api/effects/:id/title",
      [configRoot](const Request& req, Response& res){
        std::string title;
        try{
          title = nlohmann::json::parse(req.body).at("title").get<std::string>();
        }
        catch(const nlohmann::json::exception&){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_body"}});
          return;
        }
        const auto first = title.find_first_not_of(" \t");
        const auto last = title.find_last_not_of(" \t");
        title = first == std::string::npos ? std::string{} : title.substr(first, last - first + 1);
        if(title.empty() || title.size() > 80){
          _reply(res, 400, {{"succeeded", false}, {"error", "invalid_title"}});
          return;
        }
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
        std::string error;
        auto doc = store.read(id, error);
        if(!doc || !doc->is_object()){
          _reply(res, 422, {{"succeeded", false}, {"error", "unreadable_effect"}, {"message", error}});
          return;
        }
        (*doc)["title"] = title;
        if(!store.write(id, *doc, error)){
          _reply(res, 500, {{"succeeded", false}, {"error", "write_failed"}, {"message", error}});
          return;
        }
        _reply(res, 200, {{"succeeded", true}, {"id", id}, {"title", title}});
      }
    );

    server.addRoute(
      HttpMethod::Delete,
      "/api/effects/:id",
      [configRoot, reload, onEffectChosen](const Request& req, Response& res){
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
          const bool wasMcp = config.mcpEffectId() == id;
          if(wasMcp){
            config.setMcpEffectId("");
          }
          _forget(config, id);
          return true;
        });
        store.remove(id);

        nlohmann::json body{{"succeeded", true}, {"deleted", id}, {"fellBack", wasActive}};
        if(wasActive && reload){
          const std::string reloadError = reload->submit();
          if(onEffectChosen){ onEffectChosen(); }
          if(!reloadError.empty()){
            body["reloadError"] = reloadError;
          }
        }
        _reply(res, 200, body);
      }
    );
  }
}
