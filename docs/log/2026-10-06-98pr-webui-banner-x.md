# Aurora-98pr: saved-not-applied errors move to the banner; banner X (closed)

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

## Findings

- The bead text says permission rows keep Open Settings; the shell's
  existing permission row (cj11, live-verified) is Retry-only because Open
  Settings never adds Aurora to the Screen Recording list. Kept Retry-only.
- A UI-driven failing mode switch could not be produced: the Dashboard's
  switch PUT sends its own device fields, so a bogus saved input is
  overwritten and the build succeeds. The no-inline rule for that path rests
  on the node tests; the PUT-driven live case covers the same banner path.
- Banner state lags API-driven changes by up to a beat (about 5 s) since only
  UI actions call `checkNow()`; looked like a stale row until waited out.

## Not done

- Demo fork left alone (decision 7).
- Not run: the macOS Screen Recording permission row with an X (needs a TCC
  reset on the owner's Mac; the row's X logic is the same code path, tested
  in node).
