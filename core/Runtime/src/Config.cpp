#include <Aurora/Runtime/Config.hpp>

#include <algorithm>
#include <utility>

namespace Aurora::Runtime
{
  Config::Config(ConfigData data):
  m_data(std::move(data))
  {}


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
    m_data.refreshRate = std::max(refreshRate, 1u);
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
    m_data.transitionSmoothing = std::clamp(transitionSmoothing, 0.f, 0.97f);
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
  void Config::setAudioFixedAnchorHue(float hue) { m_data.audioFixedAnchorHue = hue; }

  float Config::audioBounceSmoothTime() const { return m_data.audioBounceSmoothTime; }
  void Config::setAudioBounceSmoothTime(float seconds) { m_data.audioBounceSmoothTime = seconds; }

  float Config::audioDynamismFloor() const { return m_data.audioDynamismFloor; }
  void Config::setAudioDynamismFloor(float floor) { m_data.audioDynamismFloor = floor; }

  float Config::audioCentroidStrength() const { return m_data.audioCentroidStrength; }
  void Config::setAudioCentroidStrength(float strength) { m_data.audioCentroidStrength = strength; }

  float Config::audioDriftBaseRateDegPerSec() const { return m_data.audioDriftBaseRateDegPerSec; }
  void Config::setAudioDriftBaseRateDegPerSec(float degPerSec) { m_data.audioDriftBaseRateDegPerSec = degPerSec; }

  float Config::audioVibrancySaturation() const { return m_data.audioVibrancySaturation; }
  void Config::setAudioVibrancySaturation(float saturation) { m_data.audioVibrancySaturation = saturation; }

  float Config::audioVibrancyValue() const { return m_data.audioVibrancyValue; }
  void Config::setAudioVibrancyValue(float value) { m_data.audioVibrancyValue = value; }

  float Config::audioReferenceRms() const { return m_data.audioReferenceRms; }
  void Config::setAudioReferenceRms(float rms) { m_data.audioReferenceRms = rms; }

  float Config::audioBrightnessFloor() const { return m_data.audioBrightnessFloor; }
  void Config::setAudioBrightnessFloor(float floor) { m_data.audioBrightnessFloor = floor; }

  float Config::audioCentroidRangeHz() const { return m_data.audioCentroidRangeHz; }
  void Config::setAudioCentroidRangeHz(float hz) { m_data.audioCentroidRangeHz = hz; }

  float Config::audioBrightnessSmoothTime() const { return m_data.audioBrightnessSmoothTime; }
  void Config::setAudioBrightnessSmoothTime(float seconds) { m_data.audioBrightnessSmoothTime = seconds; }
}
