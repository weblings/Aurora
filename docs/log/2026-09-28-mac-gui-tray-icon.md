# Mac tray-parity: scoping through qps.1–.4/.7, plus the tray-menu-freeze discovery

Closed `Aurora-qps.1`, `.2`, `.3`, `.4`, `.7` (children of the new
`Aurora-qps` epic, labels `1.0.4`/`MacGUI`) and filed `Aurora-zlw` (a
related but standalone finding, since it also affects Windows).

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

## qps.3: LSUIElement agent mode + TCC identity re-check

Added `LSUIElement=true` to `Info.plist.in`. Dock-hiding confirmed
programmatically, not by eye: `osascript`/System Events was blocked
(`Not authorized to send Apple events`, its own TCC gate) so instead
built a throwaway `NSRunningApplication`-based probe — a plain public API
query, no Automation permission needed — that queried the real launched
bundle's `activationPolicy` directly. Came back `Accessory`, confirming
the Dock icon/Cmd-Tab entry were really gone, not just visually absent.

TCC identity re-check needed a real capture attempt, which needed a human
for the resulting consent dialog: scoped `tccutil reset ScreenCapture
com.aurora.app` (Aurora's bundle only, nothing else touched), relaunched,
triggered `PUT /api/config {"activeInputName":"mac"}` through the live
REST API with `--fake-hue` registering a fake output so `Pipeline::build()`
actually reached the capture path. First attempt: `permission_denied`
despite a dialog appearing — reproduced the exact dual-dialog pattern
already documented in `Aurora-z4q` (a Settings-routed toggle reads
"enabled" without backing a working grant; needs a genuine quit+relaunch).
User toggled Aurora on in Settings, confirmed the entry read as Aurora
itself (not Terminal, not a duplicate), quit+reopened — reload succeeded
cleanly, `/api/monitors` returned real display data. `LSUIElement` doesn't
disturb the TCC identity `Aurora-8mk.11` already established.

## qps.4: does LaunchServices intercept a second launch before InstanceLock runs?

Fully scriptable, no GUI/mouse needed: `open <bundle>` invokes the
identical LaunchServices path a Finder double-click does. Launched Aurora
once, then again while the first was still running, using `open
--stdout/--stderr` to redirect the second launch's streams so its
behavior would be observable even if it exited fast. `open` itself
refused: *"Application ... was already running and so the redirected
stdin/stdout/stderr provided could not be set"* — and `ps` confirmed only
the original process ever existed. LaunchServices intercepts entirely;
`main()`/`InstanceLock`/`openWebBrowser(url)` never run on a second
launch. Real consequence under `LSUIElement`: a second double-click did
*nothing visible at all* — no browser tab, no window. Finding written
into `docs/MacSupport.md`; follow-up fix filed as `Aurora-qps.7` rather
than folded into the investigation.

## qps.7: fixing the second-launch (reopen) gap

Spiked before writing real code, same discipline as qps.1. Built two
throwaway probe *bundles* (LaunchServices dedup is bundle-ID-based, so a
bare binary wouldn't trigger it) testing both `applicationShouldHandleReopen:`
(delegate) and a raw `NSAppleEventManager` registration, as both accessory
and regular (Dock-visible) apps. **Neither handler style fired** under the
existing `CFRunLoopRunInMode` pump, regardless of accessory status — ruled
out an `LSUIElement`-specific cause. Root cause: Apple Events route through
`-sendEvent:`, which bare `CFRunLoopRunInMode` never calls. Switched the
probe's pump to a `-nextEventMatchingMask:`/`-sendEvent:` drain (same safe
`NSDefaultRunLoopMode` scoping) — the standard delegate method then fired
reliably, no raw registration needed after all.

Implemented for real: `TrayIcon.mm` gained `AuroraTrayAppDelegate`
(`applicationShouldHandleReopen:`, reuses the same `onLaunch` callback
`Launch UI`'s menu item already calls) and `pump()` switched to the
verified drain. Re-verified the tray's own menu still dispatched correctly
after changing the pump mechanism (real regression risk, not assumed
safe) — confirmed. Reopen itself confirmed: a second `open` while Aurora
was running opened/focused a browser tab. Lesson filed in
`docs/lessons/macos-gui.md`.

## Standing up the fake-Hue viz pipeline for GUI-only testing

User launches via Finder double-click for real end-to-end checks, which
can't pass `--fake-hue`/`--fresh`/`AURORA_DEV_LIGHT_TAP` as CLI flags or a
Terminal-scoped env var (a GUI-launched process doesn't inherit a shell's
environment). Started `fake_bridge.py` (`https://127.0.0.1:18443`,
link-button pre-pressed), `light-viz-relay/relay.py` (UDP `:18244` in, SSE
`:18245` out), and a static server for `web/demo/viz.html`
(`:8765`). Used `launchctl setenv AURORA_DEV_LIGHT_TAP 1` — sets it for
the whole GUI session, so a Finder-launched Aurora picks it up without
needing a flag. Dropped the 4-zone room map into the real config root
(`~/Library/Application Support/Aurora/profiles/hue.json`) so zones read
distinctly instead of one flat color. Gave the user the bridge address to
type into the WebUI's pairing screen (`127.0.0.1:18443`) and the viz URL
— confirmed working end to end.

## Aside: why doesn't Aurora show on Spotlight's blank-query page?

Not a signing question, despite the shape of the question — the blank
"Suggestions" page is usage-history-driven (frequency/recency of the
*user* opening something via Finder/Dock/Spotlight), a completely
different code path from text search. Aurora had been launched dozens of
times today, almost entirely via `open` from Bash for testing, which
doesn't generate the same engagement signal a real Finder/Dock/Spotlight
launch does — so it's invisible on the blank page but found instantly by
typing any prefix (confirmed: `A`, `Aur`, `Auror` all matched). Nothing to
fix; resolves itself with normal use. Found a real, separate, minor issue
along the way — two `Aurora.app` copies registered under the identical
bundle ID (today's active build plus a stale `build-app-mac-test/`
leftover) — deleted per user request, unrelated to the Spotlight question.

## Discovery: the tray menu freezes the whole pipeline while open

User asked whether frames genuinely stopped reaching the light-viz page
while the tray menu was open, or whether that was just how it looked.
Rather than reason about it, tapped the relay's SSE stream directly with a
backgrounded `curl -N` loop appending one timestamp per frame to a log
file, asked the user to hold the menu open for a few seconds. `uniq -c`
on the result showed a clean, complete gap — zero frames for several full
seconds, lining up exactly with the window the menu was open, resuming
the instant it closed. Real, not a rendering artifact.

Root cause: `NSMenu` tracking (entered from inside `-sendEvent:` when the
status item is clicked) is a nested, blocking loop that doesn't return
until the menu closes — and `TrayIcon::pump()` calls `-sendEvent:` from
the same thread that runs `pipelineHost.tick()`, so the whole pipeline
blocks for as long as the menu is open. Checked Windows and Linux in code
rather than assuming Mac-specific: Windows shares it exactly
(`TrackPopupMenuEx`, same single-thread design, same documented blocking
behavior); Linux is structurally immune (its `TrayIcon` already runs on
its own worker thread, for the unrelated `Aurora-nzd` reason). Judged
acceptable for now by the user; filed as `Aurora-zlw` (`1.0.4`, standalone
— affects Windows too, not Mac-specific) rather than fixed on the spot,
since the real fix (moving the tick loop to its own thread) is a real
architectural change, not a patch. Both lessons filed
(`docs/lessons/macos-gui.md` for the AppKit mechanism,
`docs/lessons/debugging-method.md` for the "tap the stream, don't guess"
methodology).

## State

`Aurora-qps`: 5/7 closed (`.1`/`.2`/`.3`/`.4`/`.7`). Remaining `.5`
(first-run notification) and `.6` (signing spike) are both deliberately
deprioritized, not blocking anything. `Aurora-zlw` (tray-menu-freeze fix)
filed separately, also not urgent.
