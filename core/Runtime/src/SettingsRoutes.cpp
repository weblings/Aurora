#include <Aurora/Runtime/SettingsRoutes.hpp>

#include <memory>

#include <nlohmann/json.hpp>

#include <Aurora/Contracts/Interpolation.hpp>
#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/ReloadCoalescer.hpp>

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


    nlohmann::json _outputFloorsJson(const Config& config)
    {
      nlohmann::json floors = nlohmann::json::object();
      for(const auto& [name, floor] : config.data().outputFloors){
        floors[name] = {{"policy", floor.policy}, {"floor", floor.floor}, {"holdSeconds", floor.holdSeconds}};
      }
      return floors;
    }


    nlohmann::json _toJson(const Config& config)
    {
      return {
        {"refreshRate", config.refreshRate()},
        {"subsampleWidth", config.subsampleWidth()},
        {"interpolation", _interpolationName(config.interpolation())},
        {"transitionSmoothing", config.transitionSmoothing()},
        {"brightness", config.brightness()},
        {"outputFloors", _outputFloorsJson(config)},
        {"activeInputName", config.activeInputName()},
        {"activeOutputNames", config.activeOutputNames()},
        {"activeMonitorName", config.activeMonitorName()},
        {"activeAudioInputName", config.activeAudioInputName()},
        {"activeEffectId", config.activeEffectId()},
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
        {"nuxCompleted", config.nuxCompleted()},
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
      if(body.contains("brightness")) config.setBrightness(body.at("brightness").get<float>());
      if(body.contains("outputFloors")){
        // Per-output merge: a partial entry keeps the saved values it omits.
        for(const auto& item : body.at("outputFloors").items()){
          OutputFloor floor = config.outputFloor(item.key());
          if(item.value().contains("policy")) floor.policy = item.value().at("policy").get<std::string>();
          if(item.value().contains("floor")) floor.floor = item.value().at("floor").get<float>();
          if(item.value().contains("holdSeconds")) floor.holdSeconds = item.value().at("holdSeconds").get<float>();
          config.setOutputFloor(item.key(), floor);
        }
      }
      if(body.contains("activeInputName")) config.setActiveInputName(body.at("activeInputName").get<std::string>());
      if(body.contains("activeOutputNames")) config.setActiveOutputNames(body.at("activeOutputNames").get<std::vector<std::string>>());
      if(body.contains("activeMonitorName")) config.setActiveMonitorName(body.at("activeMonitorName").get<std::string>());
      if(body.contains("activeAudioInputName")) config.setActiveAudioInputName(body.at("activeAudioInputName").get<std::string>());
      if(body.contains("activeEffectId")) config.setActiveEffectId(body.at("activeEffectId").get<std::string>());
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
      if(body.contains("nuxCompleted")) config.setNuxCompleted(body.at("nuxCompleted").get<bool>());
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

    // Writes are atomic via ConfigStore::update(); reloads are coalesced so
    // concurrent PUTs cost at most one in-flight plus one pending reload.
    std::shared_ptr<ReloadCoalescer> coalescer;
    if(onConfigChanged){
      coalescer = std::make_shared<ReloadCoalescer>(onConfigChanged);
    }

    server.addRoute(HttpMethod::Put, "/api/config", [configRoot, coalescer](const Request& req, Response& res){
      nlohmann::json body;
      try{
        body = nlohmann::json::parse(req.body);
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "invalid_json_body"}}, 400);
        return;
      }

      // Atomic read-modify-write: Pipeline::build also writes config.json
      // (derived rates), and a load() + save() here would lose its write or
      // clobber ours. A throw from the patch saves nothing.
      Config config;
      try{
        config = ConfigStore(configRoot).update([&body](Config& current){
          _applyPatch(current, body);
          return true;
        });
      }
      catch(const nlohmann::json::exception&){
        _writeJson(res, {{"succeeded", false}, {"error", "invalid_field_type"}}, 400);
        return;
      }

      nlohmann::json responseJson = {{"succeeded", true}, {"config", _toJson(config)}};
      if(coalescer){
        std::string reloadError = coalescer->submit();
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
