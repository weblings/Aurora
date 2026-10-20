#include <chrono>
#include <cstdlib>
#include <set>
#include <sstream>

#include <Aurora/Runtime/PipelineRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::EventStream;
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;


  namespace
  {
    // Shared by GET /api/state and the events stream's state topic, so the
    // stream's first event is byte-for-byte what a poll would read.
    nlohmann::json buildStateJson(PipelineHost& pipelineHost, const std::filesystem::path& configRoot)
    {
      const PipelineCapabilities capabilities = pipelineHost.capabilities();
      const std::string& audioDevicesUrl = pipelineHost.audioDevicesUrl();
      const HostStatus status = pipelineHost.status();

      nlohmann::json errors = nlohmann::json::array();
      for(const HostError& error : status.errors){
        errors.push_back({{"source", error.source}, {"message", error.message}, {"id", error.id}});
      }

      nlohmann::json conditions = nlohmann::json::array();
      for(const HostCondition& condition : pipelineHost.conditions()){
        conditions.push_back({{"source", condition.source}, {"message", condition.message}});
      }

      const PipelineSummary summary = pipelineHost.summary();
      nlohmann::json video(nullptr);
      if(summary.video){
        video = {
          {"input", summary.video->input},
          {"monitor", summary.video->monitor.empty() ? nlohmann::json(nullptr) : nlohmann::json(summary.video->monitor)}
        };
      }
      nlohmann::json audio(nullptr);
      if(summary.audio){
        // A paused host has no live input to ask: it reports the configured target.
        std::string sink = status.state == HostState::Running ? pipelineHost.resolvedAudioSink() : std::string{};
        if(sink.empty()){ sink = summary.audio->sink; }
        audio = {
          {"input", summary.audio->input},
          {"sink", sink.empty() ? nlohmann::json(nullptr) : nlohmann::json(sink)},
          {"auto", summary.audio->followsDefault}
        };
      }

      return nlohmann::json{
        {"state", hostStateName(status.state)},
        {"effect", summary.effect.empty() ? nlohmann::json(nullptr) : nlohmann::json(summary.effect)},
        {"requestedEffect", summary.requestedEffect.empty() ? nlohmann::json(nullptr) : nlohmann::json(summary.requestedEffect)},
        {"source", {{"video", video}, {"audio", audio}}},
        // The saved setting, so it reads right while paused or idle too.
        {"brightness", ConfigStore(configRoot).load().brightness()},
        {"errors", errors},
        {"conditions", conditions},
        {"paused", status.state == HostState::Paused},
        // Every host ships a Stop path (tray/quit plus POST /api/stop),
        // so this is unconditionally true here; hosts without one (the
        // demo shim) answer false and the Dashboard hides Stop
        // (Aurora-ifkn.3). Clients treat an absent flag as true.
        {"canStop", true},
        {"usesVideoInput", capabilities.usesVideoInput},
        {"usesAudioInput", capabilities.usesAudioInput},
        {"samplesZones", capabilities.samplesZones},
        {"audioDevicesUrl", audioDevicesUrl.empty() ? nlohmann::json(nullptr) : nlohmann::json(audioDevicesUrl)}
      };
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
            {"width", monitor->width},
            {"height", monitor->height},
            {"refreshRate", monitor->refreshRate},
            {"isPrimary", monitor->isPrimary}
          });
        }

        res.contentType = "application/json";
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
          res.body = nlohmann::json{{"succeeded", false}, {"error", error}}.dump();
        }
      }
    );
  }


  void registerStateRoute(
    HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  )
  {
    // Leaf-lock reads only, so polling never waits on a tick or a reload.
    // Exception: a running audio side asks the platform hook for its sink,
    // which takes the pipeline lock for the length of one tick.
    server.addRoute(
      HttpMethod::Get,
      "/api/state",
      [&pipelineHost, configRoot](const Request&, Response& res){
        res.contentType = "application/json";
        res.body = buildStateJson(pipelineHost, configRoot).dump();
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
          res.status = (error == PipelineHost::kNothingToPause) ? 409 : 500;
          res.body = nlohmann::json{{"succeeded", false}, {"error", error}}.dump();
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
    std::chrono::milliseconds heartbeat
  )
  {
    server.addStreamRoute(
      "/api/events",
      [&pipelineHost, configRoot, heartbeat](const Request& req, EventStream& stream){
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
          const nlohmann::json state = buildStateJson(pipelineHost, configRoot);
          if(topics.count("state") && state != lastState){
            lastState = state;
            send("state", state);
          }
          if(topics.count("health")){
            const nlohmann::json health = {{"errors", state.at("errors")}, {"conditions", state.at("conditions")}};
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
