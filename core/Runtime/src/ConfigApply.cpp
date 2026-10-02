#include <Aurora/Runtime/ConfigApply.hpp>

#include <array>

#include <Aurora/Runtime/ConfigStore.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    unsigned _refreshRate(const Config& config){ return config.refreshRate(); }
    unsigned _subsampleWidth(const Config& config){ return config.subsampleWidth(); }

    constexpr ApplyKind Hot = ApplyKind::Hot;
    constexpr ApplyKind Reload = ApplyKind::Reload;
    constexpr ApplyKind NoEffect = ApplyKind::NoEffect;
    constexpr ModeScope Video = ModeScope::Video;
    constexpr ModeScope Audio = ModeScope::Audio;

    // The server's port and bind address are read once before it binds and
    // are not settable through PUT /api/config; Reload is the conservative
    // answer if that ever changes.
    const std::array kFields{
      FieldApply{"restServerPort", Reload, Video},
      FieldApply{"boundBackendIP", Reload, Video},

      FieldApply{"refreshRate", Hot, Video, _refreshRate},
      FieldApply{"subsampleWidth", Hot, Video, _subsampleWidth},
      FieldApply{"interpolation", Hot, Video},
      FieldApply{"transitionSmoothing", Hot, Video},

      FieldApply{"activeInputName", Reload, Video},
      FieldApply{"activeOutputNames", Reload, Video},
      FieldApply{"activeMonitorName", Reload, Video},
      FieldApply{"activeAudioInputName", Reload, Audio},
      FieldApply{"audioTargetSinkName", Reload, Audio},

      FieldApply{"audioFixedAnchorHue", Hot, Audio},
      FieldApply{"audioBounceSmoothTime", Hot, Audio},
      FieldApply{"audioDynamismFloor", Hot, Audio},
      FieldApply{"audioCentroidStrength", Hot, Audio},
      FieldApply{"audioDriftBaseRateDegPerSec", Hot, Audio},
      FieldApply{"audioVibrancySaturation", Hot, Audio},
      FieldApply{"audioVibrancyValue", Hot, Audio},
      FieldApply{"audioReferenceRms", Hot, Audio},
      FieldApply{"audioBrightnessFloor", Hot, Audio},
      FieldApply{"audioCentroidRangeHz", Hot, Audio},
      FieldApply{"audioBrightnessSmoothTime", Hot, Audio},

      FieldApply{"nuxCompleted", NoEffect, Video},
    };
  }


  const FieldApply* classifyConfigField(std::string_view key)
  {
    for(const auto& field : kFields){
      if(field.key == key){
        return &field;
      }
    }
    return nullptr;
  }


  ChangeAction planConfigChange(const Config& applied, const Config& next, bool audioMode)
  {
    ChangeAction action = ChangeAction::None;

    for(const auto& key : changedConfigKeys(applied, next)){
      const FieldApply* field = classifyConfigField(key);

      if(!field || field->kind == ApplyKind::Reload){
        return ChangeAction::Reload;
      }
      if(field->kind == ApplyKind::NoEffect){
        continue;
      }

      const bool readInThisMode = (field->scope == ModeScope::Audio) == audioMode;
      if(!readInThisMode){
        continue;
      }

      if(field->derivedAtZero && (field->derivedAtZero(applied) == 0 || field->derivedAtZero(next) == 0)){
        return ChangeAction::Reload;
      }
      action = ChangeAction::Hot;
    }

    return action;
  }
}
