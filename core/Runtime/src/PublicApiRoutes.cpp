#include <cmath>
#include <iostream>
#include <set>

#include <Aurora/Runtime/PublicApiRoutes.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>
#include <Aurora/Network/Http/Server/Problem.hpp>
#include <Aurora/Runtime/ApplyRoutes.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/EffectsRoutes.hpp>
#include <Aurora/Runtime/HostRoutes.hpp>
#include <Aurora/Runtime/LightTest.hpp>
#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/ReloadCoalescer.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::AccessGuard;
  using Aurora::Network::Http::Server::EventStream;
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;
  using Aurora::Network::Http::Server::Scope;
  using Aurora::Network::Http::Server::setProblem;

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
      {HttpMethod::Get, "/nodes"},
      {HttpMethod::Get, "/graph/presets"},
      {HttpMethod::Get, "/graph/presets/:id"},
      {HttpMethod::Get, "/graph/preview/summary"},
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
        // False means the internal route is not registered yet: a main wired out of order.
        if(!server.aliasRoute(alias.method, std::string("/api") + alias.path, std::string("/api/v1") + alias.path)){
          std::cerr << "v1 alias skipped, no internal route: /api" << alias.path << '\n';
        }
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


  namespace
  {
    // The v1 state fields a PATCH may not write.
    const std::set<std::string> kReadOnlyStateFields = {
      "state", "effectTitle", "effectDescription", "requestedEffect", "source", "graphInputs",
      "configuredInputs", "test", "errors", "conditions", "samplesZones"
    };

    struct StatePatch
    {
      std::optional<bool> running;
      std::optional<std::string> effect;
      std::optional<float> brightness;
    };

    // Every problem is collected so one answer lists them all, nothing is written.
    void _issue(nlohmann::json& issues, const std::string& field, const char* code, const std::string& message)
    {
      issues.push_back({{"field", field}, {"code", code}, {"message", message}});
    }

    nlohmann::json _validatePatch(const nlohmann::json& body, const std::filesystem::path& configRoot, StatePatch& patch)
    {
      nlohmann::json issues = nlohmann::json::array();
      for(const auto& [key, value] : body.items()){
        if(key != "running" && key != "effect" && key != "brightness"){
          const bool readOnly = kReadOnlyStateFields.count(key) > 0;
          _issue(issues, key, readOnly ? "read_only_field" : "unknown_field",
            readOnly ? "Field is read-only." : "Field is not part of the state.");
        }
        else if(value.is_null()){
          _issue(issues, key, "null_not_allowed", "Field cannot be null.");
        }
        else if(key == "running"){
          if(value.is_boolean()){ patch.running = value.get<bool>(); }
          else{ _issue(issues, key, "invalid_field", "Must be a boolean."); }
        }
        else if(key == "effect"){
          if(!value.is_string()){
            _issue(issues, key, "invalid_field", "Must be a string.");
            continue;
          }
          const std::string id = value.get<std::string>();
          if(!id.empty() && !isBuiltInEffectId(id) && !EffectStore(configRoot).exists(id)){
            _issue(issues, key, "unknown_effect", "No such effect.");
          }
          else{ patch.effect = id; }
        }
        else{
          const double percent = value.is_number() ? value.get<double>() : -1.0;
          if(percent >= 0.0 && percent <= 100.0){ patch.brightness = static_cast<float>(percent / 100.0); }
          else{ _issue(issues, key, "invalid_field", "Must be a number from 0 to 100."); }
        }
      }
      return issues;
    }

    void _reject(Response& res, int status, const nlohmann::json& issues)
    {
      setProblem(res, status, issues.at(0).at("code").get<std::string>(), issues.at(0).at("message").get<std::string>());
      nlohmann::json body = nlohmann::json::parse(res.body);
      body["errors"] = issues;
      res.body = body.dump();
    }
  }


  void registerPublicApiRoutes(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<ReloadCoalescer> reload,
    std::shared_ptr<LightTest> lightTest,
    Aurora::Network::Http::Server::AccessGuard* guard,
    PublicApiInfo info
  )
  {
    registerV1AliasRoutes(server, guard);
    if(guard){
      guard->addMethodRule(HttpMethod::Patch, "/api/v1/state", Scope::Control);
    }

    server.addRoute(
      HttpMethod::Get,
      "/api/v1/state",
      [&pipelineHost, configRoot, lightTest](const Request&, Response& res){
        _reply(res, 200, v1StateToJson(readStateSnapshot(pipelineHost, configRoot, lightTest)));
      }
    );

    server.addRoute(
      HttpMethod::Patch,
      "/api/v1/state",
      [&pipelineHost, &registry, configRoot, reload, lightTest](const Request& req, Response& res){
        nlohmann::json body = nlohmann::json::parse(req.body, nullptr, false);
        if(!body.is_object()){
          setProblem(res, 400, "invalid_body", "Body must be a JSON object.");
          return;
        }
        StatePatch patch;
        const nlohmann::json issues = _validatePatch(body, configRoot, patch);
        if(!issues.empty()){
          _reject(res, 400, issues);
          return;
        }

        const HostState before = pipelineHost.status().state;
        if(patch.running == false && before != HostState::Running && before != HostState::Paused){
          setProblem(res, 409, PipelineHost::kNothingToPause, "Nothing is running to pause.");
          return;
        }

        if(patch.effect || patch.brightness){
          const bool fromMcp = req.client == kMcpClient && patch.effect && !patch.effect->empty() && !isBuiltInEffectId(*patch.effect);
          ConfigStore(configRoot).update([&](Config& config){
            if(patch.effect){
              config.setActiveEffectId(*patch.effect);
              if(fromMcp){ config.setMcpEffectId(*patch.effect); }
            }
            if(patch.brightness){ config.setBrightness(*patch.brightness); }
            return true;
          });
        }

        const bool toggles = patch.running && *patch.running != (before != HostState::Paused);
        const bool retry = patch.running == true && before == HostState::Failed;
        // Before the reload, which would move the pipeline and end it as pipeline_gone.
        if((patch.effect || toggles) && lightTest){
          std::string revertError;
          lightTest->stop(revertError, "superseded");
        }
        if(toggles || retry){
          std::string error;
          pipelineHost.setRunning(*patch.running, registry, configRoot, error);
        }
        else if(patch.effect || patch.brightness){
          // A paused host keeps the saved choice and applies it on resume.
          if(reload){ reload->submit(); }
          else{ applyConfigFromDisk(pipelineHost, registry, configRoot); }
        }
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
