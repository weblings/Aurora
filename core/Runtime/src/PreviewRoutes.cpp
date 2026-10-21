#include <Aurora/Runtime/PreviewRoutes.hpp>

#include <string>
#include <thread>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/DraftStore.hpp>
#include <Aurora/Runtime/GraphPreview.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::EventStream;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;

  namespace
  {
    bool _event(EventStream& stream, const char* name, const nlohmann::json& data)
    {
      return stream.write(std::string("event: ") + name + "\ndata: " + data.dump() + "\n\n");
    }

    void _fail(EventStream& stream, const char* error, const std::string& message = {})
    {
      _event(stream, "error", {{"error", error}, {"message", message}});
    }

    nlohmann::json _snapshotJson(const std::string& session, const GraphPreview::Snapshot& snapshot)
    {
      nlohmann::json outputs = nlohmann::json::array();
      for(const auto& colors : snapshot.outputs){
        nlohmann::json zones = nlohmann::json::array();
        for(const auto& zone : colors.zones){
          zones.push_back({{"id", zone.id}, {"r", zone.r}, {"g", zone.g}, {"b", zone.b}, {"error", zone.error}});
        }
        outputs.push_back({{"output", colors.output}, {"zones", std::move(zones)}});
      }
      nlohmann::json errors = nlohmann::json::array();
      for(const auto& error : snapshot.errors){
        errors.push_back({{"output", error.output}, {"node", error.node}, {"message", error.message}});
      }
      return {{"session", session}, {"tickMs", snapshot.tickMs}, {"outputs", std::move(outputs)}, {"errors", std::move(errors)}};
    }
  }


  void registerPreviewRoutes(
    HttpServer& server,
    PipelineHost& pipelineHost,
    std::shared_ptr<DraftStore> drafts,
    PreviewOptions options)
  {
    server.addStreamRoute(
      "/api/graph/preview",
      [&pipelineHost, drafts, options](const Request& req, EventStream& stream){
        const auto asked = req.queryParams.find("session");
        const std::string session = asked == req.queryParams.end() ? std::string() : asked->second;
        if(!DraftStore::validSession(session)){
          _fail(stream, "invalid_session");
          return;
        }
        auto draft = drafts->get(session);
        if(!draft){
          _fail(stream, "no_draft");
          return;
        }

        const std::uint64_t epoch = pipelineHost.buildEpoch();
        std::string error;
        std::shared_ptr<GraphPreview> preview = pipelineHost.openPreview(session, *draft, error);
        if(!preview){
          _fail(stream, "cannot_preview", error);
          return;
        }

        using Clock = std::chrono::steady_clock;
        nlohmann::json loaded = std::move(*draft);
        nlohmann::json last;
        std::string lastDraftError;
        auto lastWrite = Clock::now();
        const char* ended = nullptr;

        while(stream.open()){
          if(preview->closed()){
            ended = "replaced";
            break;
          }
          if(pipelineHost.buildEpoch() != epoch || pipelineHost.isPaused()){
            ended = "pipeline_gone";
            break;
          }
          auto current = drafts->get(session);
          if(!current){
            ended = "draft_deleted";
            break;
          }
          if(*current != loaded){
            loaded = std::move(*current);
            std::string reloadError;
            if(pipelineHost.reloadPreview(*preview, loaded, reloadError)){
              lastDraftError.clear();
            }
            else if(reloadError != lastDraftError){
              lastDraftError = reloadError;
              _fail(stream, "draft_invalid", reloadError);
            }
          }

          const nlohmann::json data = _snapshotJson(session, preview->snapshot());
          // tickMs wobbles every tick, so only the colors decide a send.
          nlohmann::json key = data;
          key.erase("tickMs");
          if(key != last){
            last = std::move(key);
            _event(stream, "preview", data);
            lastWrite = Clock::now();
          }
          else if(Clock::now() - lastWrite >= options.heartbeat){
            lastWrite = Clock::now();
            stream.write(": ping\n\n");
          }
          std::this_thread::sleep_for(options.interval);
        }

        if(ended){
          _event(stream, "ended", {{"reason", ended}});
        }
        if(ended == nullptr || std::string(ended) != "replaced"){
          pipelineHost.closePreview(session, preview.get());
        }
      }
    );
  }
}
