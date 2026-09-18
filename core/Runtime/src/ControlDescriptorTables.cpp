#include <Aurora/Runtime/ControlDescriptorTables.hpp>

namespace Aurora::Runtime
{
  std::vector<ControlDescriptor> videoControlDescriptors()
  {
    return {
      {"video.refreshRate", "dropdown", "Color updates per second"},
      {"video.subsampleWidth", "dropdown", "Captured image detail level"},
      {"video.interpolation", "dropdown", "How sampled colors blend"},
      {"video.transitionSmoothing", "slider", "Easing between color changes"},
    };
  }


  std::vector<ControlDescriptor> audioControlDescriptors()
  {
    return {
      {"audio.bounceSmoothTime", "slider", "Bounce reaction speed"},
      {"audio.brightnessSmoothTime", "slider", "Brightness reaction speed"},
      {"audio.driftBaseRateDegPerSec", "slider", "Idle color drift speed"},
      {"audio.vibrancySaturation", "slider", "Color saturation level"},
      {"audio.vibrancyValue", "slider", "Maximum color brightness"},
      {"audio.fixedHueEnabled", "bool", "Drift starts at chosen hue"},
      {"audio.fixedAnchorHue", "slider", "Drift's starting hue"},
      {"audio.dynamismFloor", "slider", "Bounce on quiet sounds"},
      {"audio.centroidStrength", "slider", "Pitch influence on drift"},
      {"audio.referenceRms", "slider", "Loudness for full brightness"},
      {"audio.brightnessFloor", "slider", "Darkest output when quiet"},
      {"audio.centroidRangeHz", "slider", "Pitch span affecting drift"},
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
}
