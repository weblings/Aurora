# R7ff: noise source nodes (Aurora-r7ff)

Id: r7ff-noise-nodes

Closed 2026-10-22. Follow-up to the Sequence D epic ([[sequence-b-planning]] node family).

## Shipped

- `noise` (TimeNodes.cpp): free-running Float, smooth value noise, params `rateHz`, `min`, `max`, `seed`.
- `image.noise` (SpatialNodes.cpp): `cells` independent flicker cells across the width, blended between
  optional `background` (black) and `color` (white) inputs; `rateHz`, `seed`, `width`, `height`.
  Same ImagePtr while time is frozen (rateHz 0).
- Shared hash and smoothstep lattice in `Graph/ValueNoise.hpp`.
- [`docs/planning/NodeGraphPipeline.md`](../planning/NodeGraphPipeline.md) node list updated.

## Verification

- `TimeNodesTests`: range, determinism per seed, seeds differ, no jumps at 60 Hz, rate 0 holds.
- `SpatialNodesTests`: `image.noise` into `zones.sample` over four zones, each flickers and none in
  lockstep; color/background blend and rate-0 cache identity. Full runtime suite 182/182 (MSVC Debug).
- Not run: live gate-style preview of a candle bank.

## Findings

- `zones.sample` averages the cells a zone covers, so independence needs about one cell per zone.

## Lessons

- none
