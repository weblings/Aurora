#pragma once

namespace Aurora::Runtime
{
  struct HostStatus;
}

namespace Aurora::App
{

// What the Pause-slot menu item does when clicked. Pulled out of TrayIcon.mm's
// -onTogglePause: (Aurora-k73j follow-up, same split as app/windows'
// resolveTrayClick) so the dispatch is testable without AppKit -- a real
// NSMenu click needs real input and can't run in a unit test.
enum class TrayPauseClickAction { LaunchUi, TogglePause };

// See-Error-click-opens-WebUI (Aurora-k73j): same rule trayPauseItemShowsError
// applies to the label, so the slot never says See Error and then toggles.
TrayPauseClickAction resolveTrayPauseClick(const Aurora::Runtime::HostStatus& status, bool webUiBound);

} // namespace Aurora::App
