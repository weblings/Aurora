#include <Aurora/App/TrayClick.hpp>

#include <Aurora/Runtime/Pipeline.hpp>
#include <Aurora/Runtime/TrayLabel.hpp>

namespace Aurora::App
{

TrayPauseClickAction resolveTrayPauseClick(const Aurora::Runtime::HostStatus& status, bool webUiBound)
{
  const bool hasError = !status.errors.empty();
  return Aurora::Runtime::trayPauseItemShowsError(status.state, hasError, webUiBound)
    ? TrayPauseClickAction::LaunchUi
    : TrayPauseClickAction::TogglePause;
}

} // namespace Aurora::App
