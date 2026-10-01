#include <Aurora/Runtime/ControlDescriptorTables.hpp>

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

#include <Aurora/Runtime/Config.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    using Contracts::ParamSchema;

    // Defaults come from ConfigData, so they stay defined in one place too.
    // Function-local, not namespace-scope: a Config built during another
    // TU's static init would otherwise read it before it's constructed.
    const ConfigData& defaults()
    {
      static const ConfigData s_defaults{};
      return s_defaults;
    }

    ControlDescriptor slider(std::string key, std::string description, ParamSchema param)
    {
      return {std::move(key), "slider", std::move(description), std::move(param)};
    }
  }


  std::vector<ControlDescriptor> videoControlDescriptors()
  {
    return {
      {"video.refreshRate", "dropdown", "Color updates per second"},
      {"video.subsampleWidth", "dropdown", "Captured image detail level"},
      {"video.interpolation", "dropdown", "How sampled colors blend"},
      slider("video.transitionSmoothing", "Easing between color changes",
        {"Transition smoothing", 0.f, 0.97f, 0.01f, "", defaults().transitionSmoothing}),
    };
  }


  std::vector<ControlDescriptor> audioControlDescriptors()
  {
    return {
      slider("audio.bounceSmoothTime", "Bounce reaction speed",
        {"Bounce smooth time", 0.05f, 2.f, 0.01f, "s", defaults().audioBounceSmoothTime}),
      slider("audio.brightnessSmoothTime", "Brightness reaction speed",
        {"Brightness smooth time", 0.05f, 2.f, 0.01f, "s", defaults().audioBrightnessSmoothTime}),
      slider("audio.driftBaseRateDegPerSec", "Idle color drift speed",
        {"Drift base rate", 0.f, 60.f, 1.f, "°/s", defaults().audioDriftBaseRateDegPerSec}),
      slider("audio.vibrancySaturation", "Color saturation level",
        {"Vibrancy saturation", 0.f, 1.f, 0.01f, "", defaults().audioVibrancySaturation}),
      slider("audio.vibrancyValue", "Maximum color brightness",
        {"Vibrancy value", 0.f, 1.f, 0.01f, "", defaults().audioVibrancyValue}),
      {"audio.fixedHueEnabled", "bool", "Drift starts at chosen hue"},
      slider("audio.fixedAnchorHue", "Drift's starting hue",
        {"Fixed hue", 0.f, 360.f, 1.f, "°", defaults().audioFixedAnchorHue, /*allowsUnset*/ true}),
      slider("audio.dynamismFloor", "Bounce on quiet sounds",
        {"Dynamism floor", 0.f, 1.f, 0.01f, "", defaults().audioDynamismFloor}),
      slider("audio.centroidStrength", "Pitch influence on drift",
        {"Centroid strength", 0.f, 1.f, 0.01f, "", defaults().audioCentroidStrength}),
      slider("audio.referenceRms", "Loudness for full brightness",
        {"Reference RMS", 0.05f, 1.f, 0.01f, "", defaults().audioReferenceRms}),
      slider("audio.brightnessFloor", "Darkest output when quiet",
        {"Brightness floor", 0.f, 1.f, 0.01f, "", defaults().audioBrightnessFloor}),
      slider("audio.centroidRangeHz", "Pitch span affecting drift",
        {"Centroid range", 100.f, 8000.f, 10.f, "Hz", defaults().audioCentroidRangeHz}),
    };
  }


  std::vector<ControlDescriptor> zoneControlDescriptors()
  {
    return {
      {"zones.gamma", "slider", "Zone brightness curve"},
      {"zones.select", "dropdown", "Zone to edit"},
      {"zones.active", "bool", "Include zone in output"},
      {"zones.autoArrange", "button", "Automatically arrange zone layout"},
    };
  }


  std::vector<ControlDescriptor> appControlDescriptors()
  {
    return {
      {"app.mode", "button", "Video or audio reactive mode"},
    };
  }


  const ParamSchema& paramSchema(std::string_view key)
  {
    // Built once; video + audio are the only tables carrying params.
    static const std::vector<ControlDescriptor> s_withParams = []{
      std::vector<ControlDescriptor> all = videoControlDescriptors();
      auto audio = audioControlDescriptors();
      all.insert(all.end(), audio.begin(), audio.end());
      std::erase_if(all, [](const ControlDescriptor& d){ return !d.param; });
      return all;
    }();

    for(const auto& descriptor : s_withParams){
      if(descriptor.key == key){
        return *descriptor.param;
      }
    }
    throw std::out_of_range("no ParamSchema for " + std::string(key));
  }


  float sanitizeParam(std::string_view key, float value)
  {
    const ParamSchema& param = paramSchema(key);

    // Finiteness first: std::clamp passes NaN straight through.
    if(!std::isfinite(value)){
      return param.defaultValue;
    }
    if(param.allowsUnset && value < param.min){
      return -1.f;
    }
    return std::clamp(value, param.min, param.max);
  }
}
