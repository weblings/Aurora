#pragma once

#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{

  // Label for the tray's Pause-slot item (Aurora-k73j). One pure function so
  // all three platform trays choose identically; each tray only calls it,
  // reading one PipelineHost::status() snapshot when the menu opens.
  //
  // Rules (docs/planning/ErrorOverlay.md, Tray section):
  // - Failed, or paused holding an error (e.g. a failed resume), shows
  //   "See Error"; clicking it opens the WebUI, where the Aurora-cj11
  //   banner explains and offers the retry.
  // - Running keeps Pause even while errors are held: since Aurora-ja76 a
  //   running host can hold a failed-reload or audio_permission entry while
  //   the old pipeline keeps driving the lights, so the error list alone
  //   must never drive the label -- state is required.
  // - Idle is Pause (status quo: idle never carries errors, and Resume on
  //   an idle host is a no-op success).
  // - webUiBound false keeps Pause/Resume: "See Error" would lead nowhere.
  inline constexpr const char* kTraySeeErrorLabel = "\xE2\x9A\xA0 See Error";

  inline bool trayPauseItemShowsError(HostState state, bool hasError, bool webUiBound)
  {
    if(!webUiBound){
      return false;
    }
    return state == HostState::Failed || (state == HostState::Paused && hasError);
  }

  inline const char* trayPauseItemLabel(HostState state, bool hasError, bool webUiBound)
  {
    if(trayPauseItemShowsError(state, hasError, webUiBound)){
      return kTraySeeErrorLabel;
    }
    return state == HostState::Paused ? "Resume" : "Pause";
  }

} // namespace Aurora::Runtime
