# B6: math nodes take an optional input with param fallback (Aurora-id8j.12)

Id: id8j12-b6-math-optional-b

Closed 2026-10-16. Follow-up to [[id8j3-b2a-scalar-math-nodes]] in the Sequence B epic.

## Shipped

- `math.add`, `math.multiply` and `math.max` in `MathNodes.cpp`: input `b` is now optional
  and falls back to a param named `b` (defaults 0, 1, 0). A wired `b` wins.
- Descriptors (purpose, useWhen, example) document the fallback, so an agent writing
  "add 0.5" gets a graph that loads.
- Matches the color and blend families (`t`, `saturation`, `phase`).

## Verification

- `MathNodesTests.cpp`: unwired param for all three, multiply default of 1, wired `b`
  beating the param. Runtime suite green (MSVC `build-core-test-win`): 168 cases.

## Carried forward

- Resolves the per-input default gap noted in the B2a log.
- `math.max` with `b` unset floors at 0, not at "no floor". Set `b` explicitly for other floors.
