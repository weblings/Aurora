# macOS tray-parity: build history

Id: mac-tray-parity-history

Status: mostly shipped — Aurora-qps.1-.4 and .7 closed. The epic's
remaining open tail (qps.5, qps.6) is [[mac-tray-parity]], not this doc.
Split out of the old MacSupport.md (Aurora-le6).

## Tray-parity (matches 1.0.2 Windows/Linux shape)

Adds `LSUIElement` agent style and an `NSStatusItem` menu on top of the
`.app` bundle already shipped (`Aurora-8mk.11`) — the macOS shapes
`archive/GUILaunchUX.md` already sketched as reference. Deferred until the
terminal-only slice was working and the audio-capture decision
([[mac-video-capture]] / [[mac-audio]]) was made; both conditions were
satisfied (`Aurora-8mk` and `Aurora-9z4` closed), and this phase was
scoped and sequenced as a beads epic, `Aurora-qps` (labels `1.0.4`,
`MacGUI`), with children `Aurora-qps.1` through `.6` covering, in order: a
manual click-test to resolve the `NSStatusItem`/run-loop-pump open a
throwaway probe left unverified, wiring a real `TrayIcon` into `app/mac`,
`LSUIElement` plus a re-check that it doesn't disturb the existing TCC
grant, a newly surfaced open around `LaunchServices`' own single-instance
semantics vs. `InstanceLock`, first-run discoverability, and
last/lowest-priority a `SMAppService` login-item signing spike.

Code-signing/notarization is **not** a blanket requirement for this
phase: local dev/testing of the tray and agent-mode mechanics needs no
Apple Developer account at all (confirmed empirically — `Aurora-qps`'s
description has the detail), the same as the already-shipped Screen
Recording work. That $99/yr remains relevant only for [[mac-notarization]],
once a build is zipped and leaves this machine — unrelated to this
phase's scope, and even there a free Xcode "Personal Team" certificate
looks likely to suffice for what this phase needs, without the $99
Developer ID.

**Revised, 2026-09-28** — more of this phase turned out to care about
signing-identity stability than first thought. `SMAppService`
(`Aurora-qps.6`) always did. `Aurora-qps.5` (first-run notification) was
scoped believing a silent `.provisional`-authorization placeholder could
land independent of `qps.6`, with only a real visible banner gated on
stable signing — spiked that empirically and found it doesn't hold:
`.provisional` was denied outright (no dialog, `granted=false`) on a
completely fresh, never-before-seen bundle identifier under ad-hoc
signing, not just an existing one with a stale prior denial. `tccutil
reset UserNotification <bundle-id>` confirmed TCC never even had a record
to be stale ("No such bundle identifier"), and the same denial held for
both `LSUIElement`/accessory and regular apps, ruling that out as a
factor too. Reads as a categorical block on ad-hoc-signed apps ever
obtaining `UserNotifications` authorization, not a rebuild-instability
risk a reset works around — so `Aurora-qps.5` became a real dependency of
`Aurora-qps.6`, not a sequenced-but-independent placeholder. Current
status of both: [[mac-tray-parity]].

## LaunchServices intercepts a second launch before InstanceLock ever runs (Aurora-qps.4)

`archive/GUILaunchUX.md`'s decided design (`Second launch opens the configured URL
and exits`) assumes a second `open`/double-click always spawns a second
process that runs `Aurora::App::InstanceLock`, finds the lock already
held, and calls `openWebBrowser(url)` before exiting — exactly what
Windows (`Shell_NotifyIcon`/`CreateProcess`) and Linux (`xdg-open`/execve)
both do, since neither has OS-level single-instance-per-bundle behavior of
its own. **macOS does**, and it preempts this entirely: tested directly
(`open <bundle>` invokes the identical LaunchServices path a Finder
double-click does, so this needed no GUI/mouse simulation) by launching
Aurora once, then launching it again while the first instance was still
running, using `open --stdout/--stderr` to redirect the second launch's
streams. `open` itself refused, printing *"Application ... was already
running and so the redirected stdin/stdout/stderr provided could not be
set"* — and `ps` confirmed only the original process ever existed, not a
second one that ran and exited quickly. LaunchServices recognizes the
bundle identifier is already running and never spawns a second process at
all; `main()`, `InstanceLock`, and the `openWebBrowser(url)` call in its
not-held branch never execute on a second launch.

**Real consequence, not just a technicality**: under `LSUIElement` agent
mode (`Aurora-qps.3`, no Dock icon), a second double-click did *nothing
visible* — no new browser tab, no window to activate, nothing. The
`InstanceLock` handoff design's whole purpose (re-surface the running
instance's URL) silently didn't fire on Mac via the standard launch path,
unlike Windows/Linux where it's the only mechanism and reliably runs.
**Fixed (`Aurora-qps.7`).** Turned out to need more than just adding a
delegate method: `TrayIcon::pump()`'s bare `CFRunLoopRunInMode` never
delivered Apple Events at all — a throwaway probe isolated this to the
pump mechanism itself, not `LSUIElement`/accessory status (neither
`applicationShouldHandleReopen:` nor a raw `NSAppleEventManager`
registration fired under the old pump, as either an accessory or a
regular Dock-visible app). Switching `pump()` to a
`-nextEventMatchingMask:`/`-sendEvent:` drain (same `NSDefaultRunLoopMode`
scoping as before) fixed it; the standard `applicationShouldHandleReopen:`
delegate method works fine once that's in place, no raw registration
needed. See `docs/lessons/macos-gui.md` ("Apple Events ... need
`-sendEvent:`") for the full investigation. Verified end to end: a second
`open` while Aurora is already running now opens/focuses a browser tab,
and the tray's own menu still dispatches correctly under the new pump.
