#include <catch2/catch_test_macros.hpp>

#include <Aurora/App/TrayIcon.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

#include "resource.h"

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

TEST_CASE("Launch UI always opens the WebUI, regardless of host state", "[trayicon]")
{
  CHECK(resolveTrayClick(IDM_LAUNCH_UI, statusWith(HostState::Running, false), true) == TrayClickAction::LaunchUi);
  CHECK(resolveTrayClick(IDM_LAUNCH_UI, statusWith(HostState::Failed, true), false) == TrayClickAction::LaunchUi);
}

TEST_CASE("Stop always stops, regardless of host state", "[trayicon]")
{
  CHECK(resolveTrayClick(IDM_STOP, statusWith(HostState::Paused, true), true) == TrayClickAction::Stop);
  CHECK(resolveTrayClick(IDM_STOP, statusWith(HostState::Idle, false), true) == TrayClickAction::Stop);
}

TEST_CASE("An unrecognized command id does nothing", "[trayicon]")
{
  CHECK(resolveTrayClick(9999u, statusWith(HostState::Idle, false), true) == TrayClickAction::None);
}

TEST_CASE("Pause slot opens the WebUI on failure or paused-with-error, else toggles", "[trayicon]")
{
  // Aurora-k73j: See Error takes over the Pause slot in exactly the states
  // the label itself switches to kTraySeeErrorLabel for.
  CHECK(resolveTrayClick(IDM_PAUSE, statusWith(HostState::Failed, false), true) == TrayClickAction::LaunchUi);
  CHECK(resolveTrayClick(IDM_PAUSE, statusWith(HostState::Paused, true), true) == TrayClickAction::LaunchUi);

  CHECK(resolveTrayClick(IDM_PAUSE, statusWith(HostState::Paused, false), true) == TrayClickAction::TogglePause);
  CHECK(resolveTrayClick(IDM_PAUSE, statusWith(HostState::Idle, false), true) == TrayClickAction::TogglePause);
  // Running keeps Pause even while holding an error (Aurora-ja76).
  CHECK(resolveTrayClick(IDM_PAUSE, statusWith(HostState::Running, true), true) == TrayClickAction::TogglePause);

  // webUiBound false: See Error would lead nowhere, stays Pause/Resume.
  CHECK(resolveTrayClick(IDM_PAUSE, statusWith(HostState::Failed, false), false) == TrayClickAction::TogglePause);
}
