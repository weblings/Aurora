# B2e: spatial Image generators (Aurora-id8j.7)

Id: id8j7-b2e-spatial-image-generators

Closed 2026-10-16. Sixth code child of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `core/Runtime/src/Graph/SpatialNodes.cpp`: `image.gradient`, `image.bar`, `image.hueRamp`.
  Each renders a small RGB image for `zones.sample`, so position comes from the ZoneMap and Frame
  needs none. Registered in `GraphRunner` (both constructors), `/api/nodes` and the PipelineTests copy.
- Shared params `width` (default 64), `height` (36), `angle` (0 left to right, 90 top to bottom).
  Axis position is 0..1 at pixel centers, scaled so image corners land on 0 and 1 at any angle.
- `image.gradient`: `gradient` param plus `phase` (Float input or param) that scrolls and wraps.
- `image.bar`: `position` (Float input or param), `size`, `softness`, `wrap`, optional `color`
  (default white) and `background` (default black) inputs.
- `image.hueRamp`: `phase` degrees (Float input or param), `span`, `saturation`, `value`.
- Cache: the same ImagePtr is returned until width, height, angle or any input/param value changes.
- `sampleGradient` moved out of `ColorNodes.cpp`'s anonymous namespace into `ColorNodes.hpp` for reuse.
- Loader clamps Float params to the schema range, so width/height are held to 1..1024 there.

## Verification

- `SpatialNodesTests.cpp`: generator into `zones.sample` over a four-quarter ZoneMap gives the
  hand-computed per-zone colors (gradient, bar at both ends), angle 90 and 180, phase wrap, bar
  inputs, softness, wrap, hueRamp pixels, cache identity, size clamp, descriptors.
  ctest 331/331 (MSVC Debug, `build-core-test-win`).

## Per-tick render cost

MSVC Release, forced re-render every tick (`AuroraRuntimeTests "[.perf]"`), angle 30, us per tick:

| size | gradient | bar | hueRamp |
|---|---|---|---|
| 64x36 | 69 | 45 | 74 |
| 96x54 | 152 | 93 | 159 |
| 192x108 | 623 | 416 | 647 |
| 480x270 | 3710 | 2371 | 3955 |

- Unchanged inputs cost nothing (cached pointer). A moving generator at 96x54 is about 1% of a
  16 ms tick. Keep generators near zone-grid size, 480x270 would eat 25%.

## Lessons

- None filed.

## Carried forward

- Per-pixel `std::function` color call, a 1D lookup table would cut cost several-fold if large
  sizes are ever needed.
