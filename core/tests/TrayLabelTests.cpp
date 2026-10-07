#include <catch2/catch_test_macros.hpp>

#include <string>

#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/TrayLabel.hpp>

using namespace Aurora::Runtime;

// The tray's Pause-slot label (Aurora-k73j): one pure core function over
// (state, hasError, webUiBound), so all three platform trays choose
// identically. Every combination below, so a later state (or a new
// held-while-running error, Aurora-ja76) cannot silently change a label.
TEST_CASE("tray label covers every state, error and bound combination", "[traylabel]")
{
  struct Case
  {
    HostState state;
    bool hasError;
    bool webUiBound;
    const char* label;
  };
  // running -> Pause even with errors held (ja76: a failed reload or
  // audio_permission entry sits beside a live pipeline); idle -> Pause
  // (status quo); unbound never shows See Error.
  const Case cases[] = {
      {HostState::Idle, false, true, "Pause"},
      {HostState::Idle, false, false, "Pause"},
      {HostState::Idle, true, true, "Pause"},
      {HostState::Idle, true, false, "Pause"},
      {HostState::Running, false, true, "Pause"},
      {HostState::Running, false, false, "Pause"},
      {HostState::Running, true, true, "Pause"},
      {HostState::Running, true, false, "Pause"},
      {HostState::Paused, false, true, "Resume"},
      {HostState::Paused, false, false, "Resume"},
      {HostState::Paused, true, true, kTraySeeErrorLabel},
      {HostState::Paused, true, false, "Resume"},
      {HostState::Failed, false, true, kTraySeeErrorLabel},
      {HostState::Failed, false, false, "Pause"},
      {HostState::Failed, true, true, kTraySeeErrorLabel},
      {HostState::Failed, true, false, "Pause"},
  };
  for(const auto& c : cases){
    INFO(hostStateName(c.state) << " hasError=" << c.hasError << " bound=" << c.webUiBound);
    CHECK(std::string(trayPauseItemLabel(c.state, c.hasError, c.webUiBound)) == c.label);
    CHECK(trayPauseItemShowsError(c.state, c.hasError, c.webUiBound)
        == (std::string(c.label) == kTraySeeErrorLabel));
  }
}
