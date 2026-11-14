# Browser checks: shell checks run in under a minute (dev poll cadence, poll-count waits, STEP)

Id: ngoj-faster-shell-checks

`Aurora-ngoj` (P2). The shell checks spent their time in fixed waits sized to the 3 s poll; agents running them per bead lost 10-15 min each.

## What changed

- `core/Runtime/src/PipelineRoutes.cpp`: the `/api/state` route reads `AURORA_DEV_POLL_MS` once at registration; a whole number 50..3000 adds `devPollMs` to the reply. Unset (every release run) the field is never written, the same presence gate as `AURORA_DEV_ERRORS`.
- `web/ui/shell.js` and `web/graph-editor/src/useHostState.ts` adopt `devPollMs` after a reply, only to go faster than 3 s; the first poll is unchanged. The takeover still takes two failed polls and the light-test countdown still comes from `confirmRemainingMs`. `web/ui/shell.test.mjs` covers it.
- `tools/browser-check/lib/waits.mjs` (new): `fastPolls()` (checks default to 300 ms; `AURORA_DEV_POLL_MS=3000` runs at the shipped cadence), `statePolls(page).polls(n)` counting `/api/state` answers, `until`, and the `STEP` helpers.
- `shell-cap`, `dashboard-shell`, `graph-editor:error-shell`: fixed waits became condition waits; "nothing happens across polls" steps wait a count of polls; countdown steps also wait for the server's remaining time to drop 1.5 s. `shell-cap` keeps one real-time 2.6 s wait, which proves the pulse's own 2 s timer.
- `STEP=<text>`: `shell-cap` runs only the matching page/window cases; the two linear checks stop after the first matching step (earlier steps are its setup). `graph-editor:narrow` keeps its short layout-settle waits (24 s already).
- README documents the knobs.

## Verification

Coordinator re-run after rebuilding `build/mac-app`, each under the stack lock: `shell-cap` 46 s (was 93), `graph-editor:error-shell` 42 s (was 146), `dashboard-shell` 38 s (was 226), `graph-editor:narrow` 24 s; all pass. `web/ui` node tests 26/26, graph editor typecheck clean, vitest 205/205, `npm run build` ok.

Watch: the error-shell countdown wait assumes the Once test has more than 1.5 s left when it starts; a much slower machine could make it flaky.

## Lessons

- none (the "While iterating" coordination lesson's timings are now stale; its rule still holds)
