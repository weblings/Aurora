# Sequence C Linux verification: core, gate 7/7, web tuning tests

Id: 52oz8-linux-verification

2026-10-20, Linux box. Closes the Linux half of the two open
verifications: [[52oz8-sequence-c-gate]] (gate on Mac/Linux) and
[[52oz2-graph-source-inputs]] (C1 both-input recheck on Mac/Linux).
Mac runs still owed.

## Core

- `cmake --build build/core-test` clean (venv cmake 4.4.3); ctest
  407/407 pass, incl. 38 `52oz.*` cases (.1: 6, .2: 1, .3: 5, .4: 6,
  .5: 10, .6: 9, .7: 1).
- Windows counts 408: the +1 is `PairingService reports a revoke it
  could not persist`, `#ifdef _WIN32` (`core/tests/PairingTests.cpp`),
  so no Linux gap.
- Monorepo `cmake --build build` clean; its ctest 136/136 (app-level
  suites; core Graph suites live in `build/core-test`).

## Gate (`tools/light-viz-relay/sequence_c_gate.py`, exit 0)

- Binary: rebuilt `build/linux-app/bin/Aurora` (Oct 18 binary was
  pre-Sequence-C) via `cmake --build build/linux-app`.
- 7/7 PASS in ~13 s: draft + validate, preview beside live (preview
  0.00, live lit), test on lights (dark under test, 6000 ms revert
  window), heartbeat-lost revert (lit again 6.3 s after the last
  heartbeat, `lastEnd heartbeat_lost`), both-input apply
  (`gate-both` on `linux-audio`, test-on-lights refused 409 as
  intended), restart keeps the graph (audio input retained),
  gone-output fallback (runs `builtin.video`, `requestedEffect`
  `gate-both`, `effect_fallback` held).
- This box exposes an audio input (`linux-audio`), so no step
  skipped and no `--allow-skip` needed. Stack torn down, ports free.
- C1 covered by the same run: the both-input graph ticks with both
  captures (`usesVideoInput` + `usesAudioInput`, lights lit) and
  survives a restart. Correction (Mac, later): that shows the both-input graph
  applies, not that audio data reaches it; the gate's audio step now checks that
  and Linux has not run it. See [[52oz8-sequence-c-gate]].

## Web (C6)

- `TuningControls.test.mjs`, `demo-shim`, `demo-tuning` and vendor
  `seams.test.mjs` (byte-identity + seam checks) all pass on node.

## Lessons

- See "A pass on applied, restarted, lit does not show a signal reaches the output" in debugging-method.
