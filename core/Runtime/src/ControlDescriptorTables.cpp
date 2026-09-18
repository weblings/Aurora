#include <Aurora/Runtime/ControlDescriptorTables.hpp>

namespace Aurora::Runtime
{
  std::vector<ControlDescriptor> videoControlDescriptors()
  {
    return {
      {"video.refreshRate", "dropdown", "Test"},
      {"video.subsampleWidth", "dropdown", "Test"},
      {"video.interpolation", "dropdown", "Test"},
      {"video.transitionSmoothing", "slider", "Test"},
    };
  }


  std::vector<ControlDescriptor> audioControlDescriptors()
  {
    return {
      {"audio.bounceSmoothTime", "slider", "Test"},
      {"audio.brightnessSmoothTime", "slider", "Test"},
      {"audio.driftBaseRateDegPerSec", "slider", "Test"},
      {"audio.vibrancySaturation", "slider", "Test"},
      {"audio.vibrancyValue", "slider", "Test"},
      {"audio.fixedHueEnabled", "bool", "Test"},
      {"audio.fixedAnchorHue", "slider", "Test"},
      {"audio.dynamismFloor", "slider", "Test"},
      {"audio.centroidStrength", "slider", "Test"},
      {"audio.referenceRms", "slider", "Test"},
      {"audio.brightnessFloor", "slider", "Test"},
      {"audio.centroidRangeHz", "slider", "Test"},
    };
  }


  std::vector<ControlDescriptor> zoneControlDescriptors()
  {
    return {
      {"zones.gamma", "slider", "Test"},
      {"zones.active", "bool", "Test"},
      {"zones.autoArrange", "button", "Test"},
    };
  }


  std::vector<ControlDescriptor> appControlDescriptors()
  {
    return {
      {"app.mode", "button", "Test"},
    };
  }
}
