# Aurora-52oz.5: test on lights with server-side auto-revert (closed)

Id: 52oz5-test-on-lights

C4 of [[sequence-c-planning]]. Core suite 398/398 on Windows Debug. The three
app `main.cpp` files got the same registration, only Windows rebuilt.

## Built

- `LightTest` (`LightTest.hpp`): one slot, injectable ms clock, hooks for
  start, revert and a pipeline generation. `poll()` ends a test at the confirm
  window or after the heartbeat lapse. A watchdog thread calls it every 500 ms
  in production, tests drive it by hand.
- Routes (`TestRoutes.hpp`), writes need `apply` via
  `addWriteRule("/api/graph/test", Apply)`: `POST /api/graph/test`, `.../heartbeat`,
  `.../revert`, `.../confirm`, and `GET /api/graph/test` (read scope).
- Defaults as planned: 15 s confirm window from the start, 2 s heartbeat
  advertised, revert after 6 s without one. Heartbeats do not extend the window.
- Start runs the draft through `PipelineHost::testGraph`, an in-place swap that
  touches neither Config, summary nor disk. A start that cannot swap in place
  (paused, other inputs, other outputs, dual-capture spike) answers 409
  `cannot_test` and a running test stays.
- Revert reads Config and the live custom effect fresh from disk and calls
  `PipelineHost::restoreEffect` (swap, or built-in via `GraphRunner::restoreGraph`),
  else `reloadPipelineFromDisk`. So a change saved during the test wins.
- A second `start` replaces the first with no revert between. The replaced
  session's heartbeat answers 404 `no_test`.
- Pause or any rebuild changes the host generation, which ends the test as
  `pipeline_gone` without a revert: the new pipeline builds from disk.
- Confirm (`/confirm {"session","id"}`) refuses 409 `draft_changed` when the
  draft no longer equals the tested graph, else runs apply's own function
  (`registerApplyRoutes` now returns it as `ApplyDraftFn`) and disarms.
- `PipelineHost::applyEffect` and the new swaps share `_swapInPlace`.

## Verified

- Fake-Hue stack, Windows Release, dummy input: a draft with `gain_hue` 0 took
  the viz zones from 0.88 to 0.0 and `GET /api/graph` showed gain 0. Two
  heartbeats kept it dark. With none, the lights returned 6.0 s after the last
  one, `lastEnd` `heartbeat_lost`, gain 1.0, state running, no errors.
- An earlier run reverted at the 15 s confirm window (`confirm_timeout`).

## Decisions

- Test is in-place only. A graph needing a rebuild (for example both-input from
  a video-only live effect) is refused rather than reloaded, because a reload
  re-handshakes Hue and has no clean revert. Apply is the path for those.
- Errors on the lights need no code: a failing node already holds its last
  good value.

## Lessons

- none
