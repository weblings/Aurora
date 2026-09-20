#pragma once

#include <string>
#include <vector>

#include <Aurora/Contracts/Interpolation.hpp>

// Generic app-level settings only -- output-specific state (bridge
// credentials, zone maps) lives in each plugin's own scope, never here.
// See docs/RuntimeAnalysis.md.
namespace Aurora::Runtime
{
  struct ConfigData
  {
    unsigned restServerPort{8215};
    std::string boundBackendIP{"0.0.0.0"};
    unsigned refreshRate{0};      // 0 == unset, derive from the display
    unsigned subsampleWidth{0};   // 0 == unset, derive from the display
    Contracts::Interpolation::Type interpolation{Contracts::Interpolation::Type::Area};
    float transitionSmoothing{0.f};

    // Which of an app's compiled-in plugins are active, by name -- looked
    // up in that app's own registry, not known to Aurora core at all.
    // Empty means unconfigured. See docs/DistributedArchitecturePlan.md.
    std::string activeInputName;
    std::vector<std::string> activeOutputNames;

    // A name (Input::MonitorData::name), not an index -- stable across
    // replug/reorder. Empty means auto (whatever IVideoInput selects by
    // default, usually primary). See Runtime/MonitorSelector.hpp.
    std::string activeMonitorName;

    // Which registered IAudioInput to run, by name. Video wins if both
    // could apply -- see main()'s dispatch logic, not a Config concept.
    std::string activeAudioInputName;

    // Mirrors Processing::AudioProcessing::AudioEffectSettings field-by-
    // field (flat here, not a nested struct, so Config stays free of any
    // Processing-module dependency). audioFixedAnchorHue < 0 means unset/
    // random, matching AudioEffectSettings::fixedAnchorHue's optional.
    // audioBounceSmoothTime/audioBrightnessSmoothTime/audioDynamismFloor/
    // audioDriftBaseRateDegPerSec: halfway between the original
    // listening-tuned defaults (0.45/0.45/0.22/6) and Aurora-Demo-Web's
    // 'tuned' preset (main.js, commit f63ecc9) -- that preset's own
    // punchier brightness response, at half strength.
    float audioFixedAnchorHue{-1.f};
    float audioBounceSmoothTime{0.285f};
    float audioDynamismFloor{0.26f};
    float audioCentroidStrength{0.3f};
    float audioDriftBaseRateDegPerSec{10.f};
    float audioVibrancySaturation{0.95f};
    float audioVibrancyValue{0.95f};
    float audioReferenceRms{0.5f};
    float audioBrightnessFloor{0.4f};
    float audioCentroidRangeHz{2250.f};
    float audioBrightnessSmoothTime{0.265f};

    // Linux-only: the exact PipeWire node.name of the sink whose monitor
    // ports to capture (see `wpctl status` + `pw-cli info <id>`). Empty
    // means auto -- Aurora-Input-Linux's AudioGrabber resolves the current
    // default sink itself via Pipewire's "default" metadata object, same
    // "no device name needed" experience as Windows' WASAPI loopback.
    // Set explicitly to override (e.g. a non-default sink).
    std::string audioTargetSinkName;

    // Set once the WebUI's onboarding wizard has ever reached the
    // Dashboard -- lets a later boot skip re-deriving "what's still
    // missing" from several live signals (bridge pairing, entertainment
    // config, mode/device, zone mapping) and go straight there. The
    // Dashboard itself already has a real fix-it path for each of those
    // (Bridge row's "Change bridge", live mode/device controls, zone
    // toggles), so a later gap doesn't strand anyone -- see
    // docs/WebUI/WebUI_Fixes.md's Pass 2 section.
    bool nuxCompleted{false};
  };


  class Config
  {
  public:
    explicit Config(ConfigData data = {});

    const ConfigData& data() const;

    unsigned restServerPort() const;
    void setRestServerPort(unsigned port);

    const std::string& boundBackendIP() const;
    void setBoundBackendIP(std::string ip);

    unsigned refreshRate() const;
    void setRefreshRate(unsigned refreshRate); // clamped to >= 1

    unsigned subsampleWidth() const;
    void setSubsampleWidth(unsigned subsampleWidth);

    Contracts::Interpolation::Type interpolation() const;
    void setInterpolation(Contracts::Interpolation::Type interpolation);

    float transitionSmoothing() const;
    void setTransitionSmoothing(float transitionSmoothing); // clamped to [0, 0.97]

    const std::string& activeInputName() const;
    void setActiveInputName(std::string name);

    const std::vector<std::string>& activeOutputNames() const;
    void setActiveOutputNames(std::vector<std::string> names);

    const std::string& activeMonitorName() const;
    void setActiveMonitorName(std::string name);

    const std::string& activeAudioInputName() const;
    void setActiveAudioInputName(std::string name);

    float audioFixedAnchorHue() const;
    void setAudioFixedAnchorHue(float hue);

    float audioBounceSmoothTime() const;
    void setAudioBounceSmoothTime(float seconds);

    float audioDynamismFloor() const;
    void setAudioDynamismFloor(float floor);

    float audioCentroidStrength() const;
    void setAudioCentroidStrength(float strength);

    float audioDriftBaseRateDegPerSec() const;
    void setAudioDriftBaseRateDegPerSec(float degPerSec);

    float audioVibrancySaturation() const;
    void setAudioVibrancySaturation(float saturation);

    float audioVibrancyValue() const;
    void setAudioVibrancyValue(float value);

    float audioReferenceRms() const;
    void setAudioReferenceRms(float rms);

    float audioBrightnessFloor() const;
    void setAudioBrightnessFloor(float floor);

    float audioCentroidRangeHz() const;
    void setAudioCentroidRangeHz(float hz);

    float audioBrightnessSmoothTime() const;
    void setAudioBrightnessSmoothTime(float seconds);

    const std::string& audioTargetSinkName() const;
    void setAudioTargetSinkName(std::string name);

    bool nuxCompleted() const;
    void setNuxCompleted(bool completed);

  private:
    ConfigData m_data;
  };
}
