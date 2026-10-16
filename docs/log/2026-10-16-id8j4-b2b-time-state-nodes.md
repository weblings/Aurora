# B2b: time/state nodes and LFO (Aurora-id8j.4)

Id: id8j4-b2b-time-state-nodes

Closed 2026-10-16. Third code child of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `core/Runtime/src/Graph/TimeNodes.cpp`: `smooth.exp`, `smooth.angle` (shortest arc),
  `rollingAverage`, `integrate` (rate deg/s to wrapped Angle), `stepOnTrigger`, `lfo`
  (sine/saw/square, free-running, min/max/rateHz).
- `frame.smoothTime` in `FrameNodes.cpp`: per-zone float state, no output param.
  `frame.smooth` is unchanged.
- Smoothing is time-based: `1 - exp(-dt/tau)`, tau in seconds (0 is instant, max 60),
  first tick snaps to the input. Non-finite input fails the node.
- Registered in `GraphRunner` (both constructors), `/api/nodes` and the PipelineTests copy.

## Verification

- `TimeNodesTests.cpp`: settle time at 30, 60 and 240 Hz for `smooth.exp`,
  `rollingAverage`, `smooth.angle` and `frame.smoothTime`; integrate wrap, trigger steps,
  LFO shapes and period at all three rates, non-finite errors, recovery, param clamp,
  descriptor completeness. Full suite green (MSVC `build-core-test-win`): 282/282 ctest.

## Lessons

- 1 filed: fake-clock tests need whole tick counts per rate (debugging-method).

## Carried forward

- B3 parity: drift's rolling average is per-tick alpha 0.02, so use `rollingAverage`
  tau = -dt/ln(0.98), about 0.825 s at 60 Hz. Parity holds at 60 Hz only.
- B3 also needs an Angle + Angle node (bounce target is anchor + offset). Not in B2b.
- `stepOnTrigger` wraps at 360 and has no direction param, use a negative `scale`.
