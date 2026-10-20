# Aurora-5ipy.7: global brightness gain stage

Id: 5ipy7-global-brightness

Builds on [[5ipy2-state-effect-source]]. Core verified under WSL, no app was run.

## Built

- `Config::brightness` (0..1, default 1, key `brightness`, slider `app.brightness`). Persisted,
  so a dim level survives restart. `ModeScope::Both` added to the apply table: Hot in video and
  audio, no reload (Aurora-c0g path).
- `frame.gain` node: scales each zone color, keeps id and gamma. Gain >= 1 returns the input
  untouched, so golden parity holds at 100%.
- Both built-in graphs get one `gain_<output>` node between the last frame node and
  `output.send`, so it runs after color computation and smoothing and before any output.
  `audioOverlayFromConfig` now takes the output names (it fills the per-output gain node).
- `GET /api/state` adds `brightness`, read from the saved config so it is right while paused
  or idle. `PUT /api/config` accepts it.

## Not done

- No boost above 100%. No floor: Aurora-6v36 runs after this stage (Aurora-pngj).
- `web/demo/vendor/webui/descriptors.json` not regenerated.

## Verification

- New tests: `frame.gain` scaling and exact-at-1, live apply with no output re-init, overlay
  carries the value, descriptor count 24. Full ctest 337/337. The concurrent settings PUT
  test failed once in a parallel run and passed on rerun (same flake class as 5ipy.2).
- Lessons: none.
