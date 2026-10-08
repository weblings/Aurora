#pragma once

namespace Aurora::Runtime
{
  struct HostStatus;
}

namespace Aurora::App
{

// What showMenu() should do once TrackPopupMenuEx() returns a picked
// command id. Pulled out of main.cpp's TrayIcon (Aurora-k73j follow-up) so
// the dispatch table is testable without a live tray -- TrackPopupMenuEx
// itself needs real input and can't run in a unit test.
enum class TrayClickAction { None, LaunchUi, TogglePause, Stop };

// picked is an IDM_* value from resource.h (passed as unsigned so this
// header stays windows.h-free). See-Error-click-opens-WebUI (Aurora-k73j)
// is folded in here via Aurora::Runtime::trayPauseItemShowsError, same rule
// every platform's tray uses for the label itself.
TrayClickAction resolveTrayClick(unsigned picked, const Aurora::Runtime::HostStatus& status, bool webUiBound);

} // namespace Aurora::App
