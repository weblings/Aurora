#include <Aurora/App/TrayIcon.hpp>

#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/TrayLabel.hpp>

#include "resource.h"

namespace Aurora::App
{

TrayClickAction resolveTrayClick(unsigned picked, const Aurora::Runtime::HostStatus& status, bool webUiBound)
{
  if(picked == IDM_LAUNCH_UI){
    return TrayClickAction::LaunchUi;
  }
  if(picked == IDM_PAUSE){
    const bool hasError = !status.errors.empty();
    return Aurora::Runtime::trayPauseItemShowsError(status.state, hasError, webUiBound)
      ? TrayClickAction::LaunchUi
      : TrayClickAction::TogglePause;
  }
  if(picked == IDM_STOP){
    return TrayClickAction::Stop;
  }
  return TrayClickAction::None;
}

} // namespace Aurora::App
