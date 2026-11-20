# A failed effect leaves no effect running

Id: kep24-failed-effect-no-fallback

`Aurora-kep2.4`, under `Aurora-kep2`. Shipped in `805f2c6`, closed here. Decision
record in [[kep22-effect-panel-mocks]], banner rules in [[error-overlay]].

## State

- A failed effect switch or startup stops the old pipeline, ends with no pipeline
  and state failed, and keeps the pick saved, so Retry and a restart try it again.
  The built-in fallback is gone.
- Failed device or settings changes still keep the running effect
  (saved-not-applied). Delete of the running effect still moves to a built-in.
- The host error has source `effect` and a `retry` flag. The banner reads
  "Couldn't start X: reason" and shows Retry only when the reason can change
  outside Aurora.
- `/api/state` keeps `requestedEffect` and `graphInputs` for the pick, so the
  Dashboard shows the pickers that can fix it, with no read-only hints.
- Inline errors stay only for requests that never ran (`Aurora-kep2.11`).

## Verification

- `PipelineTests` fallback cases rewritten. `sequence_c_gate.py` passes 9/9.
- Real Hue lights, 2026-11-04: after a failed switch the old pipeline stops and
  the lights hold the last color, which is why `Aurora-dh1p` followed.
- Fake-Hue stack on a Release build of `7cd27b9`, at 1280 and 390: a failed switch,
  a repeat failure and a failed startup each left nothing running with the banner
  row, and a working pick recovered.

- Lessons: none.
