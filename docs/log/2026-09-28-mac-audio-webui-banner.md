# WebUI banner for the audio permission signal, closing out Aurora-9z4

Closed `Aurora-9z4.7`, the last open child of `Aurora-9z4` (Mac
audio-terminal support is now fully shipped, backend through WebUI).

## What landed

`renderAudioPermissionBanner(permissionLikelyDenied)` in
`web/ui/MacPermissionRecovery.js` -- a new function alongside the existing
`renderReloadError`/`parseMacPermissionError`, colocated since it's the
same "Mac permission" concern, but a genuinely different shape: this is a
live, ongoing signal polled from `GET /api/mac/audio-status`
(`Aurora-9z4.5`), not a reload-failure string to parse. Worded as a
heuristic ("doesn't seem to be capturing real audio") rather than the
sticky, confirmed "permission is off" language the Screen Recording banner
uses -- `Aurora-9z4.4`'s signal is inferred from sustained silence, not a
hard denial, and the copy says so.

`DashboardScreen.js` gained its own poll (`_startAudioStatusPoll`, 5s
cadence, started/stopped alongside the existing heartbeat in
`mount()`/`unmount()`) rather than riding along on `_startHeartbeat`'s own
tick -- that poll is documented lock-free on purpose (a failed capabilities
fetch means the daemon is gone, not slow), and folding a pipeline-state
fetch into the same tick would have muddied that. The new poll no-ops
(just reschedules) outside Mac audio mode, and resets the banner state if
audio mode is left, so a stale "likely denied" banner can't linger into a
later session. Rendered in `_renderTopTier()`, suppressed whenever a real
`topTierError` is already showing (a reload failure is the more specific,
more actionable problem when both could apply).

No verified deep link exists straight to the "System Audio Recording Only"
settings row, unlike Screen Recording's `Privacy_ScreenCapture` anchor --
rather than guess one, the banner links to the general Privacy & Security
pane.

## Verification, and its real limit

No JS runtime (`node`/`npm`) is installed on this machine, and no
browser-automation tooling was available this session -- both checked
directly rather than assumed. What *was* verified: rebuilt `aurora-app-mac`
(re-embedding the updated `web/ui`), launched it against a fresh config
root plus `tools/fake-hue-bridge`, confirmed both edited files serve
correctly with the new symbols present (`curl` + `grep`), and re-ran the
full `PUT /api/config` → `GET /api/mac/audio-status` REST path end to end
successfully. **Not verified:** the banner actually rendering correctly in
a real browser DOM. Flagged explicitly rather than claimed -- this is a
real gap in this session's verification, not a silent assumption.

## State

`Aurora-9z4` closed out: 7/7 children done. Mac audio-terminal support
(tier 1) is complete, backend and WebUI, matching the already-shipped
Windows/Linux audio stack's shape.

## Follow-up: closing the browser-verification gap above surfaced unrelated dev-tooling work

Going back to actually check the banner in a real browser (the gap the
"Verification" section flagged) turned into more than just opening a tab.
Launching the fake-lights-viz recipe hit the WebUI's own bridge-discovery
step stuck -- unrelated to the banner itself, but blocking any browser
click-through past onboarding. Root cause: `app/mac` had no `--fake-hue`
flag, so the dev-only `AURORA_DEV_FAKE_HUE` var (the one that makes
`GET /api/hue/discover` return the fake bridge instead of trying real
network discovery) never got set by hand alongside the bridge/username/
clientkey vars. Fixed and closed separately as `Aurora-zx4` -- `FakeHue.hpp`
ported to `app/mac`/`app/windows`, see
[`docs/log/2026-09-28-fake-hue-flag-portability.md`](2026-09-28-fake-hue-flag-portability.md).
The banner itself still wasn't visually confirmed in this session (that
gap stands as written above) -- this follow-up only unblocked the path to
actually trying.

## Follow-up: video<->audio handoff confirmed live, after a real Screen Recording permission fight (`Aurora-z4q`)

With the viz recipe unblocked, the user drove the actual browser
click-through this time -- switching between Video and Audio in the
running WebUI. Audio worked immediately. Video came back
`permission_denied: ... no shareable displays` (`-3801`) despite System
Settings already showing Aurora's Screen Recording toggle enabled, and
stayed that way through a scoped `tccutil reset ScreenCapture` (blanket,
not bundle-scoped), five full quit+relaunch cycles, and an explicit
deliberate off/on toggle click -- none of it recovered by itself, unlike
`Aurora-8mk.8`'s original recovery-flow verification where one relaunch
after granting was enough.

Two hypotheses were tested live and ruled out rather than assumed: TCC
rate-limiting from the rapid repeated requests this debugging session
itself generated, and a concurrent-enumeration race (a pattern
[reported upstream](https://github.com/takezou621/kilde/issues/90)) --
both predicted a clean retest after an idle pause would succeed; a 20s
fully-idle wait followed by one single clean request still came back
denied, ruling out both. A scoped `tccutil reset ScreenCapture
com.aurora.app` (this project's own prior escape hatch, from the
`Aurora-8mk.8` lesson) confirmed a real, matching entry existed --
printed "Successfully reset" -- so the stale toggle wasn't a display
artifact. A throwaway bundled probe (`Aurora-8mk.4`'s shape, tried both
with and without a proper `NSApplication` run loop) reproduced the same
instant, dialog-free decline on a brand-new identity that never
registered in the Settings list at all -- the tell that these requests
were never reaching TCC's normal per-app decision path.

Root cause, confirmed only after the scoped reset: macOS presented a
*different* consent dialog this time, with an inline **Approve** button,
rather than every prior attempt's Settings-only/Deny pair -- this
project's own permission-recovery design (`Aurora-8mk.8`,
`MacPermissionRecovery.js`) had assumed Screen Recording is never
inline-grantable, which is only true for one of (at least) two dialog
shapes. Clicking Approve worked immediately; `GET /api/monitors`
confirmed the real display (1710x1107). Full lesson filed in
[`docs/lessons/input.md`](../lessons/input.md) ("A Settings toggle
showing 'enabled' doesn't mean a Screen Recording grant actually
works"); new standalone issue `Aurora-z4q` (not filed under `Aurora-8mk`
or `Aurora-9z4`, both already closed) tracks this specifically.

State: video<->audio mode handoff confirmed working end to end through
the real WebUI. The audio permission banner's own visual rendering is
still the one unconfirmed piece carried over from above -- audio never
needed its "doesn't seem to be capturing real audio" state during this
session, since real audio was flowing throughout.
