# Mac monitor-set rebuild: probe results and the reconfiguration filter (paused)

Id: h06o-mac-monitor-reconfiguration

`Aurora-h06o` (open, P2; 1.2.1). Windows and X11 already rebuild on a monitor-set change ([[ecl5-windows-monitors-changed]], [[9fn3-x11-monitors-changed]]) through the shared `MonitorChangeWatcher`; only the Mac grabber side is missing. This entry records the research and the first slice. Resume at the grabber override below.

- Probe: `tools/mac/virtual-display-probe.m` creates and removes a private `CGVirtualDisplay` (present on macOS 27.2.1) and logs every reconfiguration callback and screen-parameters notification. Run from Terminal.app, two add/remove cycles per run.
- Observed: add gives `BeginConfiguration` (0x1) per display, then 0x111a on the new one and 0x1000 on the existing one; remove gives 0x1 per display, then 0x1220 on the removed one and 0x1000 on the other. The removed display's UUID is already null in its callback. A recreated display with the same vendor, product and serial keeps its `CGDisplayCreateUUIDFromDisplayID` value; only the display id changes (the saved monitor key survives a replug).
- Delivery: callbacks and the notification arrived under `[NSApp run]` and under Aurora's `TrayIcon::pump` shape, and never under a bare `CFRunLoopRunInMode` or `NSRunLoop` pump (first three runs).
- Done: `DisplayReconfiguration.hpp` (`displayReconfigurationMayChangeMonitors`) and `DisplayReconfigurationTests.cpp`, 6 cases and 26 assertions, constants pinned to the CoreGraphics values; built with `cmake --build build/mac-app --target AuroraInputMacTests`.
- Not done: the `takeMonitorsChanged` override in `ScreenCaptureKitGrabber.mm` (register the callback, filter, re-enumerate, compare `monitorIdentities`), `makeHostMonitorChangeWatcher` in `app/mac/src/main.cpp`, a pass of the real app against the virtual display, mode-only and mirroring checks, and whether ScreenCaptureKit lists and captures the virtual display.
- Bead housekeeping: h06o is marked as depending on `Aurora-zbvu` (capture-card input); nothing here needs it.

## Lessons
- One entry in [[lesson-macos-gui]]: display callbacks need an AppKit event pump, and the removed display's UUID is gone in its callback.
