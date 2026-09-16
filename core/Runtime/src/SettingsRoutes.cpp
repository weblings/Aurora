#include <Aurora/Runtime/SettingsRoutes.hpp>

#include <nlohmann/json.hpp>

#include <Aurora/Contracts/Interpolation.hpp>
#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    using Aurora::Network::Http::Server::HttpMethod;
    using Aurora::Network::Http::Server::HttpServer;
    using Aurora::Network::Http::Server::Request;
    using Aurora::Network::Http::Server::Response;

    void _writeJson(Response& res, const nlohmann::json& json, int status = 200)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = json.dump();
    }


    std::string _interpolationName(Contracts::Interpolation::Type type)
    {
      for(const auto& [name, value] : Contracts::Interpolation::availableInterpolations){
        if(value == type){
          return name;
        }
      }

      return "Area"; // matches ConfigData's own default
    }


    nlohmann::json _toJson(const Config& config)
    {
      return {
        {"refreshRate", config.refreshRate()},
        {"subsampleWidth", config.subsampleWidth()},
        {"interpolation", _interpolationName(config.interpolation())},
        {"transitionSmoothing", config.transitionSmoothing()},
        {"activeInputName", config.activeInputName()},
        {"activeOutputNames", config.activeOutputNames()},
        {"activeMonitorName", config.activeMonitorName()},
        {"activeAudioInputName", config.activeAudioInputName()},
        {"audioTargetSinkName", config.audioTargetSinkName()},
        {"audioFixedAnchorHue", config.audioFixedAnchorHue()},
        {"audioBounceSmoothTime", config.audioBounceSmoothTime()},
        {"audioDynamismFloor", config.audioDynamismFloor()},
        {"audioCentroidStrength", config.audioCentroidStrength()},
        {"audioDriftBaseRateDegPerSec", config.audioDriftBaseRateDegPerSec()},
        {"audioVibrancySaturation", config.audioVibrancySaturation()},
        {"audioVibrancyValue", config.audioVibrancyValue()},
        {"audioReferenceRms", config.audioReferenceRms()},
        {"audioBrightnessFloor", config.audioBrightnessFloor()},
        {"audioCentroidRangeHz", config.audioCentroidRangeHz()},
        {"audioBrightnessSmoothTime", config.audioBrightnessSmoothTime()},
      };
    }


    // Applies only the fields present in body -- see this file's header
    // comment for why PUT is PATCH-style here. Each field funnels through
    // Config's own setter, so existing clamping applies unchanged.
    void _applyPatch(Config& config, const nlohmann::json& body)
    {
      if(body.contains("refreshRate")) config.setRefreshRate(body.at("refreshRate").get<unsigned>());
      if(body.contains("subsampleWidth")) config.setSubsampleWidth(body.at("subsampleWidth").get<unsigned>());

      if(body.contains("interpolation")){
        auto name = body.at("interpolation").get<std::string>();
        auto it = Contracts::Interpolation::availableInterpolations.find(name);
        if(it != Contracts::Interpolation::availableInterpolations.end()){
          config.setInterpolation(it->second);
        }
      }

      if(body.contains("transitionSmoothing")) config.setTransitionSmoothing(body.at("transitionSmoothing").get<float>());
      if(body.contains("activeInputName")) config.setActiveInputName(body.at("activeInputName").get<std::string>());
      if(body.contains("activeOutputNames")) config.setActiveOutputNames(body.at("activeOutputNames").get<std::vector<std::string>>());
      if(body.contains("activeMonitorName")) config.setActiveMonitorName(body.at("activeMonitorName").get<std::string>());
      if(body.contains("activeAudioInputName")) config.setActiveAudioInputName(body.at("activeAudioInputName").get<std::string>());
      if(body.contains("audioTargetSinkName")) config.setAudioTargetSinkName(body.at("audioTargetSinkName").get<std::string>());
      if(body.contains("audioFixedAnchorHue")) config.setAudioFixedAnchorHue(body.at("audioFixedAnchorHue").get<float>());
      if(body.contains("audioBounceSmoothTime")) config.setAudioBounceSmoothTime(body.at("audioBounceSmoothTime").get<float>());
      if(body.contains("audioDynamismFloor")) config.setAudioDynamismFloor(body.at("audioDynamismFloor").get<float>());
      if(body.contains("audioCentroidStrength")) config.setAudioCentroidStrength(body.at("audioCentroidStrength").get<float>());
      if(body.contains("audioDriftBaseRateDegPerSec")) config.setAudioDriftBaseRateDegPerSec(body.at("audioDriftBaseRateDegPerSec").get<float>());
      if(body.contains("audioVibrancySaturation")) config.setAudioVibrancySaturation(body.at("audioVibrancySaturation").get<float>());
      if(body.contains("audioVibrancyValue")) config.setAudioVibrancyValue(body.at("audioVibrancyValue").get<float>());
      if(body.contains("audioReferenceRms")) config.setAudioReferenceRms(body.at("audioReferenceRms").get<float>());
      if(body.contains("audioBrightnessFloor")) config.setAudioBrightnessFloor(body.at("audioBrightnessFloor").get<float>());
      if(body.contains("audioCentroidRangeHz")) config.setAudioCentroidRangeHz(body.at("audioCentroidRangeHz").get<float>());
      if(body.contains("audioBrightnessSmoothTime")) config.setAudioBrightnessSmoothTime(body.at("audioBrightnessSmoothTime").get<float>());
    }
  }


  void registerSettingsRoutes(
    HttpServer& server,
    const std::filesystem::path& configRoot,
    std::function<std::string()> onConfigChanged
  )
  {
    server.addRoute(HttpMethod::Get, "/api/config", [configRoot](const Request&, Response& res){
      Config config = ConfigStore(configRoot).load();
      _writeJson(res, _toJson(config));
    });

    server.addRoute(HttpMethod::Put, "/api/config", [configRoot, onConfigChanged](const Request& req, Response& res){
      nlohmann::json body;
      try{
        body = nlohmann::json::parse(req.body);
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "invalid_json_body"}}, 400);
        return;
      }

      ConfigStore store(configRoot);
      Config config = store.load();

      try{
        _applyPatch(config, body);
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "invalid_field_type"}}, 400);
        return;
      }

      store.save(config);

      nlohmann::json responseJson = {{"succeeded", true}, {"config", _toJson(config)}};
      if(onConfigChanged){
        std::string reloadError = onConfigChanged();
        if(!reloadError.empty()){
          // The save itself succeeded -- this is reported separately, not as
          // "succeeded": false, since the persisted value is correct even
          // though the live pipeline couldn't pick it up.
          responseJson["reloadError"] = reloadError;
        }
      }
      _writeJson(res, responseJson);
    });
  }
}
