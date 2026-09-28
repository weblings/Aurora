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
