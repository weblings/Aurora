#include <Aurora/Runtime/ConfigStore.hpp>

#include <algorithm>
#include <fstream>

#include <nlohmann/json.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    using Json = nlohmann::json;

    Json toJson(const ConfigData& data)
    {
      return Json{
        {"restServerPort", data.restServerPort},
        {"boundBackendIP", data.boundBackendIP},
        {"refreshRate", data.refreshRate},
        {"subsampleWidth", data.subsampleWidth},
        {"interpolation", static_cast<int>(data.interpolation)},
        {"transitionSmoothing", data.transitionSmoothing},
        {"activeInputName", data.activeInputName},
        {"activeOutputNames", data.activeOutputNames},
        {"activeMonitorName", data.activeMonitorName},
        {"activeAudioInputName", data.activeAudioInputName},
        {"audioFixedAnchorHue", data.audioFixedAnchorHue},
        {"audioBounceSmoothTime", data.audioBounceSmoothTime},
        {"audioDynamismFloor", data.audioDynamismFloor},
        {"audioCentroidStrength", data.audioCentroidStrength},
        {"audioDriftBaseRateDegPerSec", data.audioDriftBaseRateDegPerSec},
        {"audioVibrancySaturation", data.audioVibrancySaturation},
        {"audioVibrancyValue", data.audioVibrancyValue},
        {"audioReferenceRms", data.audioReferenceRms},
        {"audioBrightnessFloor", data.audioBrightnessFloor},
        {"audioCentroidRangeHz", data.audioCentroidRangeHz},
        {"audioBrightnessSmoothTime", data.audioBrightnessSmoothTime},
        {"audioTargetSinkName", data.audioTargetSinkName},
        {"nuxCompleted", data.nuxCompleted}
      };
    }

    // Field-by-field defaulting (not a single all-or-nothing parse) so an
    // older or hand-edited config.json still loads sensibly.
    ConfigData fromJson(const Json& json)
    {
      ConfigData defaults;
      ConfigData data;

      data.restServerPort = json.value("restServerPort", defaults.restServerPort);
      data.boundBackendIP = json.value("boundBackendIP", defaults.boundBackendIP);
      // 0 == unset (derived from the display at boot); anything above the
      // max is persisted garbage -- clamp it the way new writes are clamped.
      const unsigned storedRefreshRate = json.value("refreshRate", defaults.refreshRate);
      data.refreshRate = (storedRefreshRate == 0)
        ? 0
        : std::clamp(storedRefreshRate, 1u, Config::kMaxRefreshRate);
      data.subsampleWidth = json.value("subsampleWidth", defaults.subsampleWidth);
      data.transitionSmoothing = json.value("transitionSmoothing", defaults.transitionSmoothing);

      int interpolation = json.value("interpolation", static_cast<int>(defaults.interpolation));
      data.interpolation = (interpolation >= 0 && interpolation <= 2)
        ? static_cast<Contracts::Interpolation::Type>(interpolation)
        : defaults.interpolation;

      data.activeInputName = json.value("activeInputName", defaults.activeInputName);
      data.activeOutputNames = json.value("activeOutputNames", defaults.activeOutputNames);
      data.activeMonitorName = json.value("activeMonitorName", defaults.activeMonitorName);
      data.activeAudioInputName = json.value("activeAudioInputName", defaults.activeAudioInputName);
      data.audioFixedAnchorHue = json.value("audioFixedAnchorHue", defaults.audioFixedAnchorHue);
      data.audioBounceSmoothTime = json.value("audioBounceSmoothTime", defaults.audioBounceSmoothTime);
      data.audioDynamismFloor = json.value("audioDynamismFloor", defaults.audioDynamismFloor);
      data.audioCentroidStrength = json.value("audioCentroidStrength", defaults.audioCentroidStrength);
      data.audioDriftBaseRateDegPerSec = json.value("audioDriftBaseRateDegPerSec", defaults.audioDriftBaseRateDegPerSec);
      data.audioVibrancySaturation = json.value("audioVibrancySaturation", defaults.audioVibrancySaturation);
      data.audioVibrancyValue = json.value("audioVibrancyValue", defaults.audioVibrancyValue);
      data.audioReferenceRms = json.value("audioReferenceRms", defaults.audioReferenceRms);
      data.audioBrightnessFloor = json.value("audioBrightnessFloor", defaults.audioBrightnessFloor);
      data.audioCentroidRangeHz = json.value("audioCentroidRangeHz", defaults.audioCentroidRangeHz);
      data.audioBrightnessSmoothTime = json.value("audioBrightnessSmoothTime", defaults.audioBrightnessSmoothTime);
      data.audioTargetSinkName = json.value("audioTargetSinkName", defaults.audioTargetSinkName);
      data.nuxCompleted = json.value("nuxCompleted", defaults.nuxCompleted);

      return data;
    }
  }


  ConfigStore::ConfigStore(std::filesystem::path configRoot):
  m_configFilePath(std::move(configRoot) / "config.json")
  {}


  Config ConfigStore::load() const
  {
    if(!std::filesystem::exists(m_configFilePath)){
      return Config{};
    }

    std::ifstream file(m_configFilePath);
    Json json = Json::parse(file, nullptr, /*allow_exceptions*/ false);

    if(json.is_discarded()){
      return Config{};
    }

    return Config(fromJson(json));
  }


  void ConfigStore::save(const Config& config) const
  {
    std::filesystem::create_directories(m_configFilePath.parent_path());

    std::ofstream file(m_configFilePath);
    file << toJson(config.data()).dump(2) << "\n";
  }
}
