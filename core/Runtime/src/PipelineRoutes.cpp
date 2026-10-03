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

        res.contentType = "application/json";
        res.body = nlohmann::json{
          {"paused", pipelineHost.isPaused()},
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

        if(!running){
          pipelineHost.pause();
        }
        else if(pipelineHost.isPaused()){
          Config config = ConfigStore(configRoot).load();
          std::string error;
          if(!pipelineHost.resume(registry, config, configRoot, error)){
            res.status = 500;
            res.body = nlohmann::json{{"succeeded", false}, {"error", error}}.dump();
            return;
          }
        }

        res.body = nlohmann::json{{"succeeded", true}, {"running", !pipelineHost.isPaused()}}.dump();
      }
    );
  }
}
