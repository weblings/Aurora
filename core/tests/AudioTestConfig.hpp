#pragma once

#include <Aurora/Processing/AudioProcessing.hpp>
#include <Aurora/Runtime/Config.hpp>

namespace Aurora::Tests
{
  // AudioEffectSettings -> the ConfigData fields the built-in Audio graph overlays.
  inline Aurora::Runtime::Config audioConfigFrom(const Aurora::Processing::AudioProcessing::AudioEffectSettings& settings)
  {
    Aurora::Runtime::ConfigData data;
    data.audioFixedAnchorHue = settings.fixedAnchorHue.value_or(-1.0f);
    data.audioBounceSmoothTime = settings.bounceSmoothTime;
    data.audioDynamismFloor = settings.dynamismFloor;
    data.audioCentroidStrength = settings.centroidStrength;
    data.audioDriftBaseRateDegPerSec = settings.driftBaseRateDegPerSec;
    data.audioVibrancySaturation = settings.vibrancySaturation;
    data.audioVibrancyValue = settings.vibrancyValue;
    data.audioReferenceRms = settings.referenceRms;
    data.audioBrightnessFloor = settings.brightnessFloor;
    data.audioCentroidRangeHz = settings.centroidRangeHz;
    data.audioBrightnessSmoothTime = settings.brightnessSmoothTime;
    return Aurora::Runtime::Config(std::move(data));
  }
}
