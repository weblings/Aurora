#include <Aurora/Runtime/Config.hpp>

#include <Aurora/Runtime/ControlDescriptorTables.hpp>

#include <algorithm>
#include <utility>

namespace Aurora::Runtime
{
  Config::Config(ConfigData data):
  m_data(std::move(data))
  {
    // Every numeric setting goes through its setter's schema clamp here
    // too, so a hand-edited config.json (ConfigStore::fromJson writes
    // ConfigData directly) can't hold what a REST write couldn't
    // (Aurora-9ca/5y0/ta5).
    setTransitionSmoothing(m_data.transitionSmoothing);
    setAudioFixedAnchorHue(m_data.audioFixedAnchorHue);
    setAudioBounceSmoothTime(m_data.audioBounceSmoothTime);
    setAudioDynamismFloor(m_data.audioDynamismFloor);
    setAudioCentroidStrength(m_data.audioCentroidStrength);
    setAudioDriftBaseRateDegPerSec(m_data.audioDriftBaseRateDegPerSec);
    setAudioVibrancySaturation(m_data.audioVibrancySaturation);
    setAudioVibrancyValue(m_data.audioVibrancyValue);
    setAudioReferenceRms(m_data.audioReferenceRms);
    setAudioBrightnessFloor(m_data.audioBrightnessFloor);
    setAudioCentroidRangeHz(m_data.audioCentroidRangeHz);
    setAudioBrightnessSmoothTime(m_data.audioBrightnessSmoothTime);
  }


  const ConfigData& Config::data() const
  {
    return m_data;
  }


  unsigned Config::restServerPort() const
  {
    return m_data.restServerPort;
  }


  void Config::setRestServerPort(unsigned port)
  {
    m_data.restServerPort = port;
  }


  const std::string& Config::boundBackendIP() const
  {
    return m_data.boundBackendIP;
  }


  void Config::setBoundBackendIP(std::string ip)
  {
    m_data.boundBackendIP = std::move(ip);
  }


  unsigned Config::refreshRate() const
  {
    return m_data.refreshRate;
  }


  void Config::setRefreshRate(unsigned refreshRate)
  {
    m_data.refreshRate = std::clamp(refreshRate, 1u, kMaxRefreshRate);
  }


  unsigned Config::subsampleWidth() const
  {
    return m_data.subsampleWidth;
  }


  void Config::setSubsampleWidth(unsigned subsampleWidth)
  {
    m_data.subsampleWidth = subsampleWidth;
  }


  Contracts::Interpolation::Type Config::interpolation() const
  {
    return m_data.interpolation;
  }


  void Config::setInterpolation(Contracts::Interpolation::Type interpolation)
  {
    m_data.interpolation = interpolation;
  }


  float Config::transitionSmoothing() const
  {
    return m_data.transitionSmoothing;
  }


  void Config::setTransitionSmoothing(float transitionSmoothing)
  {
    m_data.transitionSmoothing = sanitizeParam("video.transitionSmoothing", transitionSmoothing);
  }


  const std::string& Config::activeInputName() const
  {
    return m_data.activeInputName;
  }


  void Config::setActiveInputName(std::string name)
  {
    m_data.activeInputName = std::move(name);
  }


  const std::vector<std::string>& Config::activeOutputNames() const
  {
    return m_data.activeOutputNames;
  }


  void Config::setActiveOutputNames(std::vector<std::string> names)
  {
    m_data.activeOutputNames = std::move(names);
  }


  const std::string& Config::activeMonitorName() const
  {
    return m_data.activeMonitorName;
  }


  void Config::setActiveMonitorName(std::string name)
  {
    m_data.activeMonitorName = std::move(name);
  }


  const std::string& Config::activeAudioInputName() const
  {
    return m_data.activeAudioInputName;
  }


  void Config::setActiveAudioInputName(std::string name)
  {
    m_data.activeAudioInputName = std::move(name);
  }


  float Config::audioFixedAnchorHue() const { return m_data.audioFixedAnchorHue; }
  void Config::setAudioFixedAnchorHue(float hue) { m_data.audioFixedAnchorHue = sanitizeParam("audio.fixedAnchorHue", hue); }

  float Config::audioBounceSmoothTime() const { return m_data.audioBounceSmoothTime; }
  void Config::setAudioBounceSmoothTime(float seconds) { m_data.audioBounceSmoothTime = sanitizeParam("audio.bounceSmoothTime", seconds); }

  float Config::audioDynamismFloor() const { return m_data.audioDynamismFloor; }
  void Config::setAudioDynamismFloor(float floor) { m_data.audioDynamismFloor = sanitizeParam("audio.dynamismFloor", floor); }

  float Config::audioCentroidStrength() const { return m_data.audioCentroidStrength; }
  void Config::setAudioCentroidStrength(float strength) { m_data.audioCentroidStrength = sanitizeParam("audio.centroidStrength", strength); }

  float Config::audioDriftBaseRateDegPerSec() const { return m_data.audioDriftBaseRateDegPerSec; }
  void Config::setAudioDriftBaseRateDegPerSec(float degPerSec) { m_data.audioDriftBaseRateDegPerSec = sanitizeParam("audio.driftBaseRateDegPerSec", degPerSec); }

  float Config::audioVibrancySaturation() const { return m_data.audioVibrancySaturation; }
  void Config::setAudioVibrancySaturation(float saturation) { m_data.audioVibrancySaturation = sanitizeParam("audio.vibrancySaturation", saturation); }

  float Config::audioVibrancyValue() const { return m_data.audioVibrancyValue; }
  void Config::setAudioVibrancyValue(float value) { m_data.audioVibrancyValue = sanitizeParam("audio.vibrancyValue", value); }

  float Config::audioReferenceRms() const { return m_data.audioReferenceRms; }
  void Config::setAudioReferenceRms(float rms) { m_data.audioReferenceRms = sanitizeParam("audio.referenceRms", rms); }

  float Config::audioBrightnessFloor() const { return m_data.audioBrightnessFloor; }
  void Config::setAudioBrightnessFloor(float floor) { m_data.audioBrightnessFloor = sanitizeParam("audio.brightnessFloor", floor); }

  float Config::audioCentroidRangeHz() const { return m_data.audioCentroidRangeHz; }
  void Config::setAudioCentroidRangeHz(float hz) { m_data.audioCentroidRangeHz = sanitizeParam("audio.centroidRangeHz", hz); }

  float Config::audioBrightnessSmoothTime() const { return m_data.audioBrightnessSmoothTime; }
  void Config::setAudioBrightnessSmoothTime(float seconds) { m_data.audioBrightnessSmoothTime = sanitizeParam("audio.brightnessSmoothTime", seconds); }

  const std::string& Config::audioTargetSinkName() const { return m_data.audioTargetSinkName; }
  void Config::setAudioTargetSinkName(std::string name) { m_data.audioTargetSinkName = std::move(name); }

  bool Config::nuxCompleted() const { return m_data.nuxCompleted; }
  void Config::setNuxCompleted(bool completed) { m_data.nuxCompleted = completed; }
}
