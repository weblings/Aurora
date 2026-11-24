# Mac monitor-set rebuild: probe results, filter, grabber override and a virtual-display pass

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

## Real-app pass (virtual display, same day)
Dev build `build/mac-app/bin/Aurora.app` run from Terminal.app (`--fresh --fake-hue`, input `mac`, fake bridge as output), so Screen Recording ran under Terminal's grant. A launch with `open` (the app's own identity), ad hoc or Developer ID signed under a throwaway bundle ID, got `no shareable displays` with no prompt (`tccutil` says the throwaway ID is unknown: macOS made no entry). `tools/mac/virtual-display-probe.m` added and removed a private `CGVirtualDisplay` (same serial each time, so the same display UUID) while `/api/monitors` and `source.video.monitor` in `/api/state` were polled each second.
- Add: `/api/monitors` gained the display about 2 s after the add, state stayed `running`, 0 errors, on both cycles.
- Captured display removed: with the virtual display selected by its key, removal fell back to `Display 1 (Primary)` within about 2 s, `running`, 0 errors; re-adding it was captured again by its saved key (new display id each time). Done twice.
- Mirroring: the probe mirrored the virtual display onto the main one and undid it. The mirrored display dropped out of the list and capture fell back to the primary; unmirroring brought it back and recaptured it. 5 state changes in total (initial, mirror out, unmirror in, remove), no loop.
- Paused: a display added while paused is not in `/api/monitors` (no pipeline), and resuming rebuilds the pipeline, so the list gained it at the resume (not stale); a later remove was followed normally. The watcher dropping changes while paused is therefore covered by the rebuild on resume.
- Burst: 6 add/remove cycles about 1 s apart (`--fast 1`) showed one transient list entry that lasted about 3 s, then settled on `[Display 1 (Primary)]`, `running`, 0 errors; the 1 s debounce collapsed the burst.
- Display sleep and wake (`pmset displaysleepnow`, wake with `caffeinate -u`, screen-lock delay 300 s): no change in list, capture target, state or errors.
- Not covered: a resolution or mode change (the probe's display is static; only the unit-tested filter covers it), a physical cable pull, the app's own Screen Recording and Local Network identity, and ScreenCaptureKit capture content (only the reported capture target was read, no frames inspected).
- `tccutil reset ScreenCapture com.aurora.app` was run once while trying to get a grant; a release build with that bundle ID may need its grant re-enabled.
- A Developer ID copy needs hardened runtime off here: with it the Homebrew dylibs fail library validation (different Team ID); release builds bundle their own.

## Lessons
- One entry in [[lesson-macos-gui]] (display callbacks need an AppKit event pump, the removed display's UUID is gone in its callback).
