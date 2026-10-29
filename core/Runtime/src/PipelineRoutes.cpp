#include <chrono>
#include <cstdlib>
#include <set>
#include <sstream>

#include <Aurora/Runtime/PipelineRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/LightTest.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::EventStream;
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;


  StateSnapshot readStateSnapshot(PipelineHost& pipelineHost, const std::filesystem::path& configRoot,
    const std::shared_ptr<LightTest>& lightTest)
  {
    StateSnapshot snap;
    if(lightTest){
      snap.test = lightTest->info();
    }
    snap.capabilities = pipelineHost.capabilities();
    snap.audioDevicesUrl = pipelineHost.audioDevicesUrl();
    snap.status = pipelineHost.status();
    snap.conditions = pipelineHost.conditions();
    snap.summary = pipelineHost.summary();
    if(snap.summary.audio){
      // A paused host has no live input to ask: it reports the configured target.
      snap.audioSink = snap.status.state == HostState::Running ? pipelineHost.resolvedAudioSink() : std::string{};
      if(snap.audioSink.empty()){ snap.audioSink = snap.summary.audio->sink; }
    }
    const Config config = ConfigStore(configRoot).load();
    snap.mcpEffectId = config.mcpEffectId();
    snap.brightness = config.brightness();
    snap.activeInputName = config.activeInputName();
    snap.activeAudioInputName = config.activeAudioInputName();
    if(!snap.summary.effect.empty()){
      snap.effect = effectInfo(configRoot, snap.summary.effect);
    }
    return snap;
  }

  // Shared by GET /api/state and the events stream's state topic, so the
  // stream's first event is byte-for-byte what a poll would read.
  nlohmann::json stateToJson(const StateSnapshot& snap)
  {
    const PipelineSummary& summary = snap.summary;

    nlohmann::json errors = nlohmann::json::array();
    for(const HostError& error : snap.status.errors){
      errors.push_back({{"source", error.source}, {"message", error.message}, {"id", error.id}});
    }

    nlohmann::json conditions = nlohmann::json::array();
    for(const HostCondition& condition : snap.conditions){
      conditions.push_back({{"source", condition.source}, {"message", condition.message}});
    }

    nlohmann::json video(nullptr);
    if(summary.video){
      video = {
        {"input", summary.video->input},
        {"monitor", summary.video->monitor.empty() ? nlohmann::json(nullptr) : nlohmann::json(summary.video->monitor)}
      };
    }
    nlohmann::json audio(nullptr);
    if(summary.audio){
      audio = {
        {"input", summary.audio->input},
        {"sink", snap.audioSink.empty() ? nlohmann::json(nullptr) : nlohmann::json(snap.audioSink)},
        {"auto", summary.audio->followsDefault}
      };
    }

    // Null only while no pipeline runs.
    nlohmann::json graphInputs(nullptr);
    if(summary.graphInputs){
      graphInputs = {{"video", summary.graphInputs->video}, {"audio", summary.graphInputs->audio}};
    }

    nlohmann::json effectTitle(nullptr);
    nlohmann::json effectDescription(nullptr);
    if(snap.effect){
      effectTitle = snap.effect->title;
      if(!snap.effect->description.empty()){ effectDescription = snap.effect->description; }
    }

    return nlohmann::json{
      {"state", hostStateName(snap.status.state)},
      {"effect", summary.effect.empty() ? nlohmann::json(nullptr) : nlohmann::json(summary.effect)},
      {"effectTitle", effectTitle},
      {"effectDescription", effectDescription},
      {"requestedEffect", summary.requestedEffect.empty() ? nlohmann::json(nullptr) : nlohmann::json(summary.requestedEffect)},
      {"mcpEffectId", snap.mcpEffectId.empty() ? nlohmann::json(nullptr) : nlohmann::json(snap.mcpEffectId)},
      {"source", {{"video", video}, {"audio", audio}}},
      {"graphInputs", graphInputs},
      // The saved setting, so it reads right while paused or idle too.
      {"brightness", snap.brightness},
      {"test", {
        {"active", snap.test.active},
        {"confirmRemainingMs", snap.test.confirmRemainingMs},
        {"holder", snap.test.active
          ? nlohmann::json{
              {"session", snap.test.session},
              {"client", snap.test.client.empty() ? nlohmann::json(nullptr) : nlohmann::json(snap.test.client)}
            }
          : nlohmann::json(nullptr)}
      }},
      {"errors", errors},
      {"conditions", conditions},
      {"paused", snap.status.state == HostState::Paused},
      // Every host ships a Stop path (tray/quit plus POST /api/stop),
      // so this is unconditionally true here; hosts without one (the
      // demo shim) answer false and the Dashboard hides Stop
      // (Aurora-ifkn.3). Clients treat an absent flag as true.
      {"canStop", true},
      {"usesVideoInput", snap.capabilities.usesVideoInput},
      {"usesAudioInput", snap.capabilities.usesAudioInput},
      {"samplesZones", snap.capabilities.samplesZones},
      {"audioDevicesUrl", snap.audioDevicesUrl.empty() ? nlohmann::json(nullptr) : nlohmann::json(snap.audioDevicesUrl)}
    };
  }

  nlohmann::json healthToJson(const StateSnapshot& snap)
  {
    const nlohmann::json state = stateToJson(snap);
    return {{"errors", state.at("errors")}, {"conditions", state.at("conditions")}};
  }

  void runEventsStream(
    const Request& req,
    EventStream& stream,
    PipelineHost& pipelineHost,
    const std::filesystem::path& configRoot,
    std::chrono::milliseconds heartbeat,
    const std::shared_ptr<LightTest>& lightTest,
    const EventPayloadBuilders& builders
  )
  {
    // Unknown topics are ignored, as clients ignore unknown state values.
    std::set<std::string> topics;
    const auto asked = req.queryParams.find("topics");
    if(asked != req.queryParams.end()){
      std::stringstream list(asked->second);
      for(std::string item; std::getline(list, item, ',');){
        topics.insert(item);
      }
    }
    if(topics.empty()){
      topics = {"state", "health"};
    }

    // Read before the first snapshot: a change landing in between wakes
    // the loop instead of being lost.
    ChangeSignal& changes = pipelineHost.changes();
    std::uint64_t seen = changes.revision();

    using Clock = std::chrono::steady_clock;
    nlohmann::json lastState;
    nlohmann::json lastHealth;
    auto lastWrite = Clock::now();
    auto lastCheck = lastWrite;

    const auto send = [&](const char* topic, const nlohmann::json& data){
      lastWrite = Clock::now();
      return stream.write(std::string("event: ") + topic + "\ndata: " + data.dump() + "\n\n");
    };

    const auto publish = [&]{
      lastCheck = Clock::now();
      const StateSnapshot snap = readStateSnapshot(pipelineHost, configRoot, lightTest);
      if(topics.count("state")){
        const nlohmann::json state = builders.state(snap);
        if(state != lastState){
          lastState = state;
          send("state", state);
        }
      }
      if(topics.count("health")){
        const nlohmann::json health = builders.health(snap);
        if(health != lastHealth){
          lastHealth = health;
          send("health", health);
        }
      }
    };

    publish();
    while(stream.open()){
      // Short slices so a stop or a dead peer is noticed promptly.
      const std::uint64_t now = changes.waitPast(seen, std::chrono::milliseconds(250));
      const bool changed = now != seen;
      seen = now;

      // Brightness lives in config.json, which nothing signals, so
      // re-read it about once a second even without a signal.
      if(changed || Clock::now() - lastCheck >= std::chrono::seconds(1)){
        publish();
      }
      if(Clock::now() - lastWrite >= heartbeat){
        lastWrite = Clock::now();
        stream.write(": ping\n\n");
      }
    }
  }


  void registerMonitorsRoute(
    HttpServer& server,
    PipelineHost& pipelineHost
  )
  {
    server.addRoute(
      HttpMethod::Get,
      "/api/monitors",
      [&pipelineHost](const Request&, Response& res){
        auto monitors = pipelineHost.listMonitors();

        nlohmann::json list = nlohmann::json::array();
        for(size_t i = 0; i < monitors.size(); ++i){
          const auto& monitor = monitors[i];
          list.push_back({
            {"id", i},
            {"name", monitor->name},
            {"key", monitor->key},
            {"width", monitor->width},
            {"height", monitor->height},
            {"refreshRate", monitor->refreshRate},
            {"isPrimary", monitor->isPrimary}
          });
        }

        res.contentType = "application/json";
        // canSelectMonitor moved to /api/capabilities (static per host).
        res.body = nlohmann::json{{"monitors", list}}.dump();
      }
    );
  }


  void registerReloadRoute(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  )
  {
    server.addRoute(
      HttpMethod::Post,
      "/api/reload",
      [&pipelineHost, &registry, configRoot](const Request&, Response& res){
        // reload()'s own bool, not an empty-error check: a failure whose
        // exception carries no message must still answer 500.
        Config config = ConfigStore(configRoot).load();
        std::string error;
        res.contentType = "application/json";
        if(pipelineHost.reload(registry, config, configRoot, error)){
          res.body = nlohmann::json{{"succeeded", true}}.dump();
        }
        else{
          res.status = 500;
          res.body = nlohmann::json{{"succeeded", false}, {"error", "reload_failed"}, {"message", error}}.dump();
        }
      }
    );
  }


  void registerStateRoute(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<LightTest> lightTest
  )
  {
    // Leaf-lock reads only, so polling never waits on a tick or a reload.
    // Exception: a running audio side asks the platform hook for its sink,
    // which takes the pipeline lock for the length of one tick.
    server.addRoute(
      HttpMethod::Get,
      "/api/state",
      [&pipelineHost, configRoot, lightTest](const Request&, Response& res){
        res.contentType = "application/json";
        res.body = stateToJson(readStateSnapshot(pipelineHost, configRoot, lightTest)).dump();
      }
    );

    server.addRoute(
      HttpMethod::Put,
      "/api/state",
      [&pipelineHost, &registry, configRoot](const Request& req, Response& res){
        res.contentType = "application/json";

        bool running;
        try{
          running = nlohmann::json::parse(req.body).at("running").get<bool>();
        }
        catch(const nlohmann::json::exception&){
          res.status = 400;
          res.body = nlohmann::json{{"succeeded", false}, {"error", "running_bool_required"}}.dump();
          return;
        }

        std::string error;
        if(!pipelineHost.setRunning(running, registry, configRoot, error)){
          // Nothing to pause is not a server fault: the host is idle or
          // failed, so the request cannot apply (409, as the zone routes
          // answer while paused).
          const bool nothingToPause = (error == PipelineHost::kNothingToPause);
          res.status = nothingToPause ? 409 : 500;
          res.body = nothingToPause
            ? nlohmann::json{{"succeeded", false}, {"error", error}}.dump()
            : nlohmann::json{{"succeeded", false}, {"error", "set_running_failed"}, {"message", error}}.dump();
          return;
        }

        const HostState state = pipelineHost.status().state;
        res.body = nlohmann::json{
          {"succeeded", true},
          {"running", state == HostState::Running},
          {"state", hostStateName(state)}
        }.dump();
      }
    );

    server.addRoute(
      HttpMethod::Post,
      "/api/state/dismiss",
      [&pipelineHost](const Request& req, Response& res){
        res.contentType = "application/json";

        std::string source;
        std::uint64_t id;
        try{
          const nlohmann::json body = nlohmann::json::parse(req.body);
          source = body.at("source").get<std::string>();
          id = body.at("id").get<std::uint64_t>();
        }
        catch(const nlohmann::json::exception&){
          res.status = 400;
          res.body = nlohmann::json{{"succeeded", false}, {"error", "source_and_id_required"}}.dump();
          return;
        }

        switch(pipelineHost.dismissError(source, id)){
          case PipelineHost::DismissResult::Removed:
            res.body = nlohmann::json{{"succeeded", true}, {"dismissed", true}}.dump();
            break;
          case PipelineHost::DismissResult::Stale:
            res.body = nlohmann::json{{"succeeded", true}, {"dismissed", false}}.dump();
            break;
          case PipelineHost::DismissResult::NotRunning:
            res.status = 409;
            res.body = nlohmann::json{{"succeeded", false}, {"error", "not_running"}}.dump();
            break;
        }
      }
      );
  }

  void registerEventsRoute(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const std::filesystem::path& configRoot,
    std::chrono::milliseconds heartbeat,
    std::shared_ptr<LightTest> lightTest
  )
  {
    server.addStreamRoute(
      "/api/events",
      [&pipelineHost, configRoot, heartbeat, lightTest](const Request& req, EventStream& stream){
        runEventsStream(req, stream, pipelineHost, configRoot, heartbeat, lightTest, EventPayloadBuilders{});
      }
    );
  }


  void registerDevErrorsRoute(
    HttpServer& server,
    PipelineHost& pipelineHost
  )
  {
    // Presence-only flag, same convention as AURORA_DEV_LIGHT_TAP:
    // without it the routes below are never registered, so release
    // traffic always 404s here no matter who asks.
    if(!std::getenv("AURORA_DEV_ERRORS")){
      return;
    }

    server.addRoute(
      HttpMethod::Post,
      "/api/dev/errors",
      [&pipelineHost](const Request& req, Response& res){
        res.contentType = "application/json";

        std::string source;
        std::string message;
        try{
          const nlohmann::json body = nlohmann::json::parse(req.body);
          source = body.at("source").get<std::string>();
          message = body.at("message").get<std::string>();
        }
        catch(const nlohmann::json::exception&){
          res.status = 400;
          res.body = nlohmann::json{{"succeeded", false}, {"error", "source_and_message_required"}}.dump();
          return;
        }
        if(source.empty() || message.empty()){
          res.status = 400;
          res.body = nlohmann::json{{"succeeded", false}, {"error", "source_and_message_required"}}.dump();
          return;
        }

        if(!pipelineHost.setError(source, message)){
          res.status = 409;
          res.body = nlohmann::json{{"succeeded", false}, {"error", "not_running"}}.dump();
          return;
        }
        res.body = nlohmann::json{{"succeeded", true}}.dump();
      }
    );

    server.addRoute(
      HttpMethod::Post,
      "/api/dev/errors/remove",
      [&pipelineHost](const Request& req, Response& res){
        res.contentType = "application/json";

        std::string source;
        try{
          source = nlohmann::json::parse(req.body).at("source").get<std::string>();
        }
        catch(const nlohmann::json::exception&){
          res.status = 400;
          res.body = nlohmann::json{{"succeeded", false}, {"error", "source_required"}}.dump();
          return;
        }

        res.body = nlohmann::json{{"succeeded", true}, {"removed", pipelineHost.removeError(source)}}.dump();
      }
    );
  }
}
