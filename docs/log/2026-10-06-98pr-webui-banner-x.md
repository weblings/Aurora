# Aurora-98pr: saved-not-applied errors move to the banner; banner X (paused)

Id: 98pr-webui-banner-x

2026-10-06. WebUI half of [[error-overlay]]'s shell-by-cause revision, on top
of [[ja76-hold-running-reload-error]]. Node-test part built and green; the
live Mac check is not run yet (resume below).

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

## Not done

- Live Mac check (running host + failed switch: banner row, no inline
  line, X clears it, stale id no-op, Retry).
- Demo fork left alone (decision 7).
