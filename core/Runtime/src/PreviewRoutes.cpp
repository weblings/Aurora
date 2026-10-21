#include <Aurora/Runtime/PreviewRoutes.hpp>

#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

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

    void _reply(Aurora::Network::Http::Server::Response& res, int status, const nlohmann::json& body)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = body.dump();
    }

    struct ZoneStats
    {
      std::uint8_t id{0};
      double sum[3]{0, 0, 0};
      double last[3]{0, 0, 0};
      double minBrightness{1.0};
      double maxBrightness{0.0};
      double totalStep{0.0};
      int samples{0};
      bool error{false};

      void add(const GraphPreview::Zone& zone)
      {
        const double now[3] = {zone.r, zone.g, zone.b};
        for(int c = 0; c < 3; ++c){
          sum[c] += now[c];
          if(samples > 0){
            totalStep += std::abs(now[c] - last[c]) / 3.0;
          }
          last[c] = now[c];
        }
        const double brightness = std::max({now[0], now[1], now[2]});
        minBrightness = std::min(minBrightness, brightness);
        maxBrightness = std::max(maxBrightness, brightness);
        error = error || zone.error;
        ++samples;
      }

      double change() const { return samples > 1 ? totalStep / (samples - 1) : 0.0; }
    };

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
    const Registry& registry,
    std::shared_ptr<DraftStore> drafts,
    PreviewOptions options)
  {
    server.addRoute(
      Aurora::Network::Http::Server::HttpMethod::Get,
      "/api/graph/preview/summary",
      [&pipelineHost, &registry, drafts, options](const Request& req, Aurora::Network::Http::Server::Response& res){
        const auto asked = req.queryParams.find("session");
        const std::string session = asked == req.queryParams.end() ? std::string() : asked->second;
        if(!DraftStore::validSession(session)){
          _reply(res, 400, {{"error", "invalid_session"}});
          return;
        }
        double seconds = std::min(3.0, options.maxSummarySeconds);
        const auto secondsParam = req.queryParams.find("seconds");
        if(secondsParam != req.queryParams.end()){
          try{
            std::size_t used = 0;
            seconds = std::stod(secondsParam->second, &used);
            if(used != secondsParam->second.size() || !std::isfinite(seconds) || seconds <= 0.0){
              throw std::invalid_argument("seconds");
            }
          }
          catch(const std::logic_error&){
            _reply(res, 400, {{"error", "invalid_seconds"}});
            return;
          }
          seconds = std::min(seconds, options.maxSummarySeconds);
        }
        auto draft = drafts->get(session);
        if(!draft){
          _reply(res, 404, {{"error", "no_draft"}});
          return;
        }

        // Its own key, so a stream open on the session is not replaced.
        const std::string key = session + "#summary";
        const std::uint64_t epoch = pipelineHost.buildEpoch();
        std::string error;
        std::shared_ptr<GraphPreview> preview = pipelineHost.openPreview(key, *draft, registry, error);
        if(!preview){
          _reply(res, 422, {{"error", "cannot_preview"}, {"message", error}});
          return;
        }

        const auto step = std::max(options.interval, std::chrono::milliseconds(1));
        const int samples = std::max(2, static_cast<int>(std::ceil(seconds * 1000.0 / step.count())));
        std::map<std::string, std::vector<ZoneStats>> stats;
        std::vector<std::string> order;
        GraphPreview::Snapshot latest;
        bool gone = false;
        for(int i = 0; i < samples; ++i){
          if(options.sleep){ options.sleep(step); }
          else{ std::this_thread::sleep_for(step); }
          if(preview->closed() || pipelineHost.buildEpoch() != epoch || pipelineHost.isPaused()){
            gone = true;
            break;
          }
          latest = preview->snapshot();
          for(const auto& colors : latest.outputs){
            auto [it, fresh] = stats.try_emplace(colors.output);
            if(fresh){ order.push_back(colors.output); }
            auto& zones = it->second;
            if(zones.size() < colors.zones.size()){ zones.resize(colors.zones.size()); }
            for(std::size_t z = 0; z < colors.zones.size(); ++z){
              zones[z].id = colors.zones[z].id;
              zones[z].add(colors.zones[z]);
            }
          }
        }
        pipelineHost.closePreview(key, preview.get());
        if(gone){
          _reply(res, 409, {{"error", "pipeline_gone"}});
          return;
        }

        nlohmann::json outputs = nlohmann::json::array();
        for(const auto& name : order){
          nlohmann::json zones = nlohmann::json::array();
          double outputChange = 0.0;
          for(const auto& zone : stats[name]){
            if(zone.samples == 0){ continue; }
            outputChange = std::max(outputChange, zone.change());
            zones.push_back({
              {"id", zone.id},
              {"mean", {{"r", zone.sum[0] / zone.samples}, {"g", zone.sum[1] / zone.samples}, {"b", zone.sum[2] / zone.samples}}},
              {"brightnessMin", zone.minBrightness},
              {"brightnessMax", zone.maxBrightness},
              {"change", zone.change()},
              {"error", zone.error}
            });
          }
          outputs.push_back({{"output", name}, {"change", outputChange}, {"zones", std::move(zones)}});
        }
        nlohmann::json errors = nlohmann::json::array();
        for(const auto& e : latest.errors){
          errors.push_back({{"output", e.output}, {"node", e.node}, {"message", e.message}});
        }
        _reply(res, 200, {
          {"session", session}, {"seconds", seconds}, {"samples", samples},
          {"outputs", std::move(outputs)}, {"errors", std::move(errors)}
        });
      }
    );

    server.addStreamRoute(
      "/api/graph/preview",
      [&pipelineHost, &registry, drafts, options](const Request& req, EventStream& stream){
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
        std::shared_ptr<GraphPreview> preview = pipelineHost.openPreview(session, *draft, registry, error);
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
