# Mac tray-parity kickoff: scoping, run-loop spike, and the first real NSStatusItem

Closed `Aurora-qps.1`, `Aurora-qps.2` (children of the new `Aurora-qps`
epic, labels `1.0.4`/`MacGUI`).

## Scoping

Investigated what closing the Mac GUI-launch/tray gap against Windows
(`Aurora-x2o`) and Linux (`Aurora-lx4`) would take, now that both Mac tier-1
epics (`Aurora-8mk` video, `Aurora-9z4` audio) are closed and
`docs/MacSupport.md`'s deferred "Tray-parity" phase's conditions are met.
Landed on a 6-phase sequence (`Aurora-qps.1`–`.6`): run-loop click-test,
wire the real `TrayIcon`, `LSUIElement` agent mode, a newly surfaced open
around `LaunchServices`' own single-instance semantics vs. `InstanceLock`,
first-run discoverability, and a deliberately low-priority/parallel
`SMAppService` signing spike (neither Windows nor Linux ship launch-at-
login yet, so this doesn't catch up to a shipped feature). Corrected
`docs/MacSupport.md`'s stale claim that code-signing is a blanket
requirement for this phase — confirmed empirically that it isn't, except
for the login-item spike specifically.

## qps.1: does a manually-pumped run loop actually service NSStatusItem clicks?

Built a throwaway probe (plain `clang++`, no bundle, no
`NSApplicationMain`, no signing — deliberately the worst case) to check
whether `CFRunLoopRunInMode(kCFRunLoopDefaultMode, ...)` pumped once per
tick-loop iteration (the AppKit analog of Windows' `PeekMessage` pump)
actually delivers clicks to an `NSStatusItem`. First run: construction
succeeded cleanly (`setActivationPolicy` returned `YES`, menu attached, 259
ticks pumped over 12s with no crash) but nothing was clicked during that
window, so first-click delivery was still unverified.

Root cause of the gap: `-[NSApplication run]` normally calls
`-finishLaunching` as part of AppKit's own startup handshake; since
`main()` never calls `-run` (it pumps manually instead), that handshake
never happened. Added an explicit `[NSApp finishLaunching]` call, re-ran
with a 60s window and clearer on-screen prompting. User clicked both
`Launch UI` and `Stop` — both dispatched, the menu didn't auto-dismiss, and
the process exited cleanly on `Stop`. Filed as a general lesson (see
`docs/lessons/macos-gui.md`) since the failure mode is silent
non-responsiveness, not an error.

## Icon: does the existing multi-color logo work as a template icon?

Initially assumed the 1024px logo master (a black "A" letterform with a
multi-color aurora-wave gradient overlaid on top) couldn't serve as a
menu-bar template icon without a redraw — reasoning that flattening a
multi-color image via `isTemplate` would collapse both shapes into one
undifferentiated blob. That reasoning was wrong, caught by a correction:
`isTemplate` reads only the alpha channel: since both the letterform and
the wave are fully opaque, both silhouettes survive flattening, only the
color distinction is lost. Verified with a throwaway CoreGraphics tool
that simulated the real rendering (alpha-threshold to solid black/white,
composited on light/dark swatches) at both 18px and 36px — legible at
both, no redraw needed. Also hit `template` being a reserved C++ keyword,
breaking dot-syntax (`icon.template = YES`) in the `.mm` file — needed the
explicit `[icon setTemplate:YES]` message instead. Both filed in
`docs/lessons/macos-gui.md`.

## qps.2: wiring the real TrayIcon

New `app/mac/src/TrayIcon.mm` + `include/Aurora/App/TrayIcon.hpp` (PIMPL,
same shape as `ScreenCaptureKitGrabber.mm`), `make_tray_icon.sh` (sips
downsample, same approach as `make_icns.sh`, no separate monochrome asset
needed per the icon finding above), and `main.cpp` wiring matching
app/linux's exact placement (`TrayIcon` constructed once `url`/
`webUiBound` are known, `pump()` called once per tick-loop iteration after
the `sleep_until`). Deliberately no worker thread, unlike Linux's
`TrayIcon` (`NSStatusItem` must live on the main thread, which the tick
loop already owns) — sidesteps the promise/future-handoff bug class
`Aurora-nzd` hit on Linux entirely, rather than needing to avoid it.

Built clean via the `mac-app` preset, launched the real bundle with `open`
(not a direct exec) against a `--fresh` config root, confirmed the WebUI
bound. User confirmed live: the Aurora "A" mark rendered in the menu bar,
`Launch UI` opened the WebUI, `Stop` quit the app — process exited cleanly.

Not exercised: the `Aurora-cgr` high-refresh-rate tick-cadence cross-check
(this run had no configured pipeline, so tick timing under real load
wasn't stressed) — worth a look if `cgr` work ever touches this loop.

## State

`Aurora-qps.1`/`.2` closed. `Aurora-qps.3` (`LSUIElement` agent mode + TCC
identity re-check) is next, unblocked, not yet started.
