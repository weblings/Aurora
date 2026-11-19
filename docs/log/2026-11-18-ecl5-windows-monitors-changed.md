# Windows rebuilds the pipeline when the monitor set changes

Id: ecl5-windows-monitors-changed

`Aurora-ecl5`, the Windows half of `Aurora-9fn3`. `WindowsGrabber` runs a hidden top-level window on its own thread for `WM_DISPLAYCHANGE` (a message-only window does not get the broadcast). `takeMonitorsChanged` re-enumerates with a fresh DXGI factory (a stale one keeps listing old outputs) and returns true once, only when the sorted key-or-name identities differ, so mode, position and resolution changes never rebuild. The shared `MonitorChangeWatcher` does the debounced reconnect, wired in `app/windows/src/main.cpp`.

## Verification
- `AuroraInputWindowsTests` 55 assertions in 11 cases, 3 new `[MonitorKey]` cases by exact name. `Aurora.exe` builds.
- Hardware pass on the owner machine (3 monitors, devstack with the built Debug app), displays changed by `ChangeDisplaySettingsEx`: DISPLAY2 3840x2160 to 2560x1440 and back, no rebuild. DISPLAY1 detached then reattached: `/api/monitors` 3 to 2 to 3 within about 2 s each way. With DISPLAY1 captured, detach fell back to DISPLAY3 with no errors and frames flowing, reattach captured DISPLAY1 again.
- Detach is a software stand-in for an unplug. A cable pulled or moved to another port was not tried. Light test and pause paths rest on the core `MonitorChangeWatcher` tests.
- `m_factory` is read only by `_enumerateMonitors` on the tick thread. The capture thread uses the stored per-monitor adapter and output, so the factory swap does not race with it.

## Lessons
- `activeMonitorName` is resolved by key. A name PUT stored fine but did not move the capture until the key was sent.
