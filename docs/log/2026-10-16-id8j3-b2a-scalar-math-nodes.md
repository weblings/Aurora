# B2a: scalar math nodes (Aurora-id8j.3)

Id: id8j3-b2a-scalar-math-nodes

Closed 2026-10-16. Second code child of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `core/Runtime/src/Graph/MathNodes.cpp`: `math.scale`, `math.divide`,
  `math.clamp`, `math.mapRange`, `math.lerp`, `math.add`, `math.multiply`,
  `math.max`, `math.invert`. Stateless, Float in, Float `value` out.
- Constant operands (factor, divisor, bounds, lerp ends) are params, signals
  are ports. `add`/`multiply`/`max` take two Float inputs `a`, `b`.
- Non-finite result fails the node. Zero divisor, `min > max` and
  `inMin == inMax` fail the node with a message naming the param.
- Param range is +/-1e6 (loader clamps), so the schema stays finite.
- Registered in `GraphRunner` (both constructors) and `/api/nodes`.

## Verification

- `MathNodesTests.cpp`: per-node cases, error cases, non-finite, param clamp,
  descriptor completeness. Suite green (MSVC `build-core-test-win`):
  Runtime 98 cases, Pipeline 62 cases.

## Lessons

- 3 filed: four registration sites for a node family
  (architecture-process), shared `ScalarMathNode` wrapper guards non-finite once
  (architecture-process), Git Bash heredoc wrote nothing (build-toolchain).

## Carried forward

- Next in the epic: B3 decomposition parity gate (Aurora-id8j.9) needs the time/state,
  color and frame primitives as well as these math nodes.
- Per-input Float defaults are not supported, so `add`/`multiply`/`max` need both
  inputs wired. A constant operand uses `math.scale` or a param instead.
