# Aurora-98pr: saved-not-applied errors move to the banner; banner X (live checks in progress)

Id: 98pr-webui-banner-x

2026-10-06. WebUI half of [[error-overlay]]'s shell-by-cause revision, on top
of [[ja76-hold-running-reload-error]]. Node tests green; live Mac check run
the same day (below).

## Done

- **Dashboard** (`DashboardScreen.js`): `_onDeviceFieldChange` and
  `_switchMode` no longer turn a PUT's `reloadError` into `topTierError` /
  `toggleError`; both call `app.checkNow()` so the banner redraws without
  waiting for the beat. Plain rejection (`succeeded:false`) stays inline
  (decision 8). ModeDeviceScreen's onboarding `renderReloadError` untouched
  (decision 3). `parseMacPermissionError` import dropped.
- **Shell** (`shell.js`, `shell.css`): a `reload` row on a `running` host
  reads "Saved, but couldn't apply: <reason>. Aurora is still running your
  previous setup and will try the new one next time it starts." Other
  states keep "Couldn't apply settings:". X on a row only when
  `hostState === 'running'` (and the entry has an `id`); click posts
  `{source, id}` to `/api/state/dismiss`, then `checkNow()`, no optimistic
  clearing. Permission rows keep the Retry-only copy and gain the X.
- **Retry**: no change; `_retry` already posts `/api/reload` for a `reload`
  row. Regression test added.
- **`_visibleErrors` gate** (decision 13): hides nothing a post-onboarding
  route needs. `navigate()` without a route id keeps the previous id, so
  ZoneMapping and the Dashboard's OutputConnect stay `dashboard`.
- **Tests**: Aurora-nkhi's carried tests adapted (inline now null for both
  paths; plain rejection stays inline; checkNow-before-deciding dropped).
  Shell: X running-only, dismiss payload, no X for failed or paused-resume
  rows, permission row. Mutant check: the old DashboardScreen.js fails the
  flipped tests ("banner owns the failure").

## Owner's Mac pass (same day, found by the owner)

- **Failed resume was inline too.** `_togglePause` set "Couldn't resume
  Aurora." under the toggles whenever `PUT /api/state` returned
  `succeeded:false` (a 500 only for a failed build, which the daemon holds as
  a `resume` error) -- a duplicate of the banner row, far from the Pause
  button. A rejected resume now sets nothing and calls `checkNow()`; "Couldn't
  pause" and the blip-path copy stay inline (nothing held for them).
- **Retry cannot recover a denied prompt.** After Don't Allow, macOS does not
  prompt again, so Retry did nothing visible. The banner row for
  `permission_denied:` now carries the `Privacy_ScreenCapture` link beside
  Retry; `permission_pending:` stays Retry-only (the prompt is the fix).
  Web search confirmed only that an app cannot re-prompt after a denial; the
  deep link works on the owner's Mac. First cut keyed the copy on "denied =
  Don't Allow clicked"; wrong: `Denied` in `ScreenCaptureKitGrabber.mm` is
  "answered with zero displays", which is also the never-asked state after a
  TCC reset (Retry then raises the prompt). Final copy covers both: "Allow it
  in the macOS prompt if one appears, or turn it on in System Settings, then
  Retry.", Retry first, Settings link second.
- **Live, owner's real denial** (their `open`-launched Aurora.app on 8215,
  state `paused`, `resume: permission_denied: ScreenCaptureKitGrabber...`):
  row shows the new copy, link href `...?Privacy_ScreenCapture`, Retry, no X
  (paused); clicking Resume again leaves no inline error. Confirms a real Don't
  Allow produces the `permission_denied:` prefix. Not done: clicking the link
  itself in a real browser, and whether Aurora shows in the pane with the
  toggle off after Deny (the inference behind showing the link).
- A directly exec'd binary runs under the terminal's grant, so it never shows
  the denial; only an `open`-launched bundle does.

## Findings

- The bead text says permission rows keep Open Settings; the shell's
  existing permission row (cj11, live-verified) is Retry-only because Open
  Settings never adds Aurora to the Screen Recording list. Kept Retry-only.

## Live Mac check (2026-10-06)

Rebuilt `build/mac-app`; ran the app with `AURORA_CONFIG_DIR` in the session
scratchpad (port 8261, `dummy` input, fake bridge) and drove the Dashboard
with headless Chromium (Playwright). Not the owner's real instance.

- Running host, `PUT /api/config` with a bogus `activeInputName`: response
  `succeeded:true` + `reloadError`; `/api/state` stays `running` with one
  `reload` error; the banner shows the saved-not-applied copy, X and Retry;
  no inline error anywhere on the Dashboard.
- Stale id: a repeat failure gets a new id; `dismiss` with the old id returns
  `dismissed:false` and the error stays. An X click from a banner still
  holding the old id is the same no-op, then `checkNow()` redraws with the new
  id and the next click clears it (`running`, `errors: []`).
- Retry: after saving a working input (which does not reload, the running
  baseline already matches, so the error stays held), the banner Retry
  (`POST /api/reload`) clears it.
- Paused host with a failed `resume`: row reads "Couldn't resume: ...", Retry,
  no X. Fixing the input and resuming clears it.
- Screenshot checked: X sits top-right, text does not run under it.
- UI-clicked failing switch (second pass): the switch PUT overwrites a bogus
  saved input, so the failure came from a saved `activeOutputNames:
  ["nonexistent-output"]` (reload error "No outputs available"), dismissed,
  then Video clicked from audio. Result: state stays `audio`/`running`, a new
  `reload` error is held, the banner shows the saved-not-applied row with X,
  no switch error inline. (Taking the fake bridge down did not fail the
  build: Hue init failure is swallowed by design.)
- Permission row with X, **mocked, not a real denial**: Playwright answered
  `GET /api/state` with a running host and a `permission_denied:` reload
  error (id 5) against the real page. Row reads "Screen Recording is off...
  then Retry" with Retry and X; the X click posts `{source:'reload',id:5}`
  to `/api/state/dismiss` and the row clears once the poll stops returning it.

## Findings

- The bead text says permission rows keep Open Settings; the shell's
  existing permission row (cj11, live-verified) is Retry-only because Open
  Settings never adds Aurora to the Screen Recording list. Kept Retry-only.
- A bogus saved input cannot fail a UI-clicked switch: the Dashboard's
  switch PUT sends its own device fields, so the build succeeds. A bad
  saved output does fail it (see above).
- The "Aurora doesn't seem to be capturing real audio" line is still inline
  on the Dashboard (the audio heuristic); Aurora-h457 moves it.
- Banner state lags API-driven changes by up to a beat (about 5 s) since only
  UI actions call `checkNow()`; looked like a stale row until waited out.

## Not done

- Demo fork left alone (decision 7).
- Permission row with X on a *running* host (real denial): the owner's
  denial case was a paused host (no X). Needs a running host to fail a Video
  switch under a real denial.
