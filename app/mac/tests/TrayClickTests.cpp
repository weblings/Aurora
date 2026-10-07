#include <catch2/catch_test_macros.hpp>

#include <Aurora/App/TrayClick.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

using namespace Aurora::App;
using Aurora::Runtime::HostError;
using Aurora::Runtime::HostState;
using Aurora::Runtime::HostStatus;

namespace
{
  HostStatus statusWith(HostState state, bool hasError)
  {
    HostStatus status;
    status.state = state;
    if(hasError){
      status.errors.push_back(HostError{"resume", "boom", 1});
    }
    return status;
  }
}

TEST_CASE("Pause slot opens the WebUI on failure or paused-with-error, else toggles", "[trayclick]")
{
  // Aurora-k73j: See Error takes over the Pause slot in exactly the states
  // the label itself switches to kTraySeeErrorLabel for.
  CHECK(resolveTrayPauseClick(statusWith(HostState::Failed, false), true) == TrayPauseClickAction::LaunchUi);
  CHECK(resolveTrayPauseClick(statusWith(HostState::Paused, true), true) == TrayPauseClickAction::LaunchUi);

  CHECK(resolveTrayPauseClick(statusWith(HostState::Paused, false), true) == TrayPauseClickAction::TogglePause);
  CHECK(resolveTrayPauseClick(statusWith(HostState::Idle, false), true) == TrayPauseClickAction::TogglePause);
  // Running keeps Pause even while holding an error (Aurora-ja76).
  CHECK(resolveTrayPauseClick(statusWith(HostState::Running, true), true) == TrayPauseClickAction::TogglePause);

  // webUiBound false: See Error would lead nowhere, stays Pause/Resume.
  CHECK(resolveTrayPauseClick(statusWith(HostState::Failed, false), false) == TrayPauseClickAction::TogglePause);
}
