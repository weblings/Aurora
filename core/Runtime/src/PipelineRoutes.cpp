#include <cstdlib>

#include <Aurora/Runtime/PipelineRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;


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
    // Lock-free reads only (atomics), so polling this never waits on a tick
    // or a reload in progress.
    server.addRoute(
      HttpMethod::Get,
      "/api/state",
      [&pipelineHost](const Request&, Response& res){
        const PipelineCapabilities capabilities = pipelineHost.capabilities();
        const std::string& audioDevicesUrl = pipelineHost.audioDevicesUrl();
        const HostStatus status = pipelineHost.status();

        nlohmann::json errors = nlohmann::json::array();
        for(const HostError& error : status.errors){
          errors.push_back({{"source", error.source}, {"message", error.message}, {"id", error.id}});
        }

        res.contentType = "application/json";
        res.body = nlohmann::json{
          {"state", hostStateName(status.state)},
          {"errors", errors},
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
        }.dump();
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
