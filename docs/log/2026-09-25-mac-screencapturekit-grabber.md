# ScreenCaptureKit grabber lands: real Mac capture, validated end to end

Closed `Aurora-8mk.5` (`1.0.3`/`MacVideoTerminal`), the epic's remaining
P0-shaped item now that `Aurora-8mk.4`/`.11` (TCC probe + bundle wrapper)
were resolved earlier today.

`input/mac/src/ScreenCaptureKitGrabber.mm` (Objective-C++): a PIMPL header
(`ScreenCaptureKitGrabber.hpp`) keeps every ScreenCaptureKit/AppKit/CoreMedia
type out of the C++ side, mirroring the boundary `input/mac`'s tests and
`app/mac`'s call sites already rely on. `_initMonitorsList()` bridges
`SCShareableContent`'s async completion handler to `IVideoInput::init()`'s
sync contract with a bounded `std::promise`/`future` wait (5s, copying
`AudioGrabber.cpp`'s pattern rather than `PipewireGrabber.cpp`'s live
unbounded-`.wait()` bug), picks the primary display, and configures/starts
the `SCStream` in the same call. Points-vs-pixels handled by matching the
chosen `SCDisplay` against `NSScreen` (via `NSScreenNumber`) for
`backingScaleFactor` -- `SCDisplay` itself only reports points.
`CGDisplayCreateImage` turned out to be gone entirely as of macOS 15, so
`SCShareableContent`/`SCStream` was a requirement, not a style choice, by
the time this landed. Registered as the `"mac"` input name in
`app/mac`'s registry; `"dummy"` stays the config default so a fresh
install never triggers a Screen Recording prompt unasked.

`input/mac/CMakeLists.txt` gained `enable_language(OBJCXX)` and links
against `ScreenCaptureKit`/`CoreMedia`/`CoreVideo`/`AppKit`, ARC enabled
via `-fobjc-arc` on just the one `.mm` file. All 62 existing tests still
pass unchanged (no unit tests added for the grabber itself -- same
not-unit-testable category as `X11Grabber`/`PipewireGrabber`, needs a real
display session).

Validated the real thing, not just that it compiles: spun up
`tools/fake-hue-bridge` + `tools/light-viz-relay` + `viz.html` --
identical shape to `Aurora-gj0.7`'s Linux validation. Set
`activeInputName=mac` via the REST API, watched real per-zone colors flow
the full pipeline (ScreenCaptureKit -> subsample -> compose -> smooth ->
`HueOutput` -> `DevLightTap` -> relay -> `viz.html`), and had the user
confirm the decisive test: dragging a colorful window across the screen
visibly shifted the matching lamp's color live, not just brightness.
`refreshRate`/`subsampleWidth` derived correctly from the real Retina
display (60 / 190) instead of Dummy's fixed 16x9.

Hit two distinct TCC gates in sequence, both now written up in
`docs/lessons/input.md`: Screen Recording (System Settings, as designed
around since `Aurora-8mk.4`), and a second, separate "bypass the system
picker" consent alert that only appears on a real run (macOS Sequoia+) --
capturing the whole display directly via `SCContentFilter
initWithDisplay:excludingWindows:` skips Apple's own `SCContentSharingPicker`
UI (the right call for a background ambient-light daemon), but that itself
needs one-time consent, gating frame delivery *after* `startCaptureWithCompletionHandler`
already reported success. Neither gate was something the design doc had
fully anticipated; both are now documented for the next platform-permission
surface that comes up.

One side-finding not resolved: `tools/light-viz-relay/validate.py frame`
(the `DevFrameDump`-based independent cross-check) reported no data on
every attempt despite identical, already-working-on-Linux wiring and
`AURORA_DEV_FRAME_DUMP=1` confirmed present in the process environment.
`AURORA_DEV_LIGHT_TAP` worked immediately on the same run and gave a fully
convincing validation, so that's what was used -- the `DevFrameDump` gap
is spun off as `Aurora-8mk.12` (P3, not a blocker) rather than chased
further in-session. Lesson filed in `docs/lessons/debugging-method.md`.

State: `Aurora-8mk.4`, `.5`, `.11` closed. `Aurora-8mk.12` open (low
priority, unresolved `DevFrameDump` gap). Unblocked:
`Aurora-gj0.8` (Mac validation of the light-viz pipeline -- its own
acceptance criteria is now essentially already demonstrated by this
session's manual run, though the bead itself wasn't formally closed),
`Aurora-8mk.6` (multi-monitor), `Aurora-8mk.8` (permission recovery flow),
`Aurora-8mk.9` (lock/sleep stream health).
