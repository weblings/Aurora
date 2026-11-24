# Mac monitor-set rebuild: probe results, filter and grabber override (paused before the real-app pass)

Id: h06o-mac-monitor-reconfiguration

`Aurora-h06o` (open, P2; 1.2.1). Windows and X11 already rebuild on a monitor-set change ([[ecl5-windows-monitors-changed]], [[9fn3-x11-monitors-changed]]) through the shared `MonitorChangeWatcher`; only the Mac grabber side is missing. This entry records the research and the first slice. Resume at the grabber override below.

- Probe: `tools/mac/virtual-display-probe.m` creates and removes a private `CGVirtualDisplay` (present on macOS 27.2.1) and logs every reconfiguration callback and screen-parameters notification. Run from Terminal.app, two add/remove cycles per run.
- Observed: add gives `BeginConfiguration` (0x1) per display, then 0x111a on the new one and 0x1000 on the existing one; remove gives 0x1 per display, then 0x1220 on the removed one and 0x1000 on the other. The removed display's UUID is already null in its callback. A recreated display with the same vendor, product and serial keeps its `CGDisplayCreateUUIDFromDisplayID` value; only the display id changes (the saved monitor key survives a replug).
- Delivery: callbacks and the notification arrived under `[NSApp run]` and under Aurora's `TrayIcon::pump` shape, and never under a bare `CFRunLoopRunInMode` or `NSRunLoop` pump (first three runs).
- Done: `DisplayReconfiguration.hpp` (`displayReconfigurationMayChangeMonitors`) and `DisplayReconfigurationTests.cpp`, 6 cases and 26 assertions, constants pinned to the CoreGraphics values; built with `cmake --build build/mac-app --target AuroraInputMacTests`.
- Done, second slice: `ScreenCaptureKitGrabber::takeMonitorsChanged`. One process-wide `CGDisplayRegisterReconfigurationCallback` (registered in the constructor, never removed) bumps an atomic counter when the filter says membership may have changed; the tick thread sees a new count, re-reads the active displays from CoreGraphics (key else name, `monitorIdentities`) and returns true only when they differ from the baseline taken in `_initMonitorsList`. CoreGraphics, not `SCShareableContent`, so there is no Screen Recording dependency or cross-process wait on the tick thread, and mirroring cannot make the two views disagree. An empty list mid-replug is not a change. `app/mac/src/main.cpp` now starts `makeHostMonitorChangeWatcher` next to the link monitor and stops it before shutdown. Mac app and input tests: 126 of 126 pass.
- Not done: any run of the real app against the virtual display (needs Screen Recording and Local Network identity on this dev build, likely prompts), mode-only and mirroring checks, whether ScreenCaptureKit lists and captures the virtual display, and a unit test for `takeMonitorsChanged` itself (needs a delivered callback, so only the app run covers it).
- Bead housekeeping: h06o is marked as depending on `Aurora-zbvu` (capture-card input); nothing here needs it.

## Lessons
- One entry in [[lesson-macos-gui]]: display callbacks need an AppKit event pump, and the removed display's UUID is gone in its callback.
