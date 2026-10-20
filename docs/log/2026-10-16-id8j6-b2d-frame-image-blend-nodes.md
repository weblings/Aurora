# B2d: frame and image ops with blend modes (Aurora-id8j.6)

Id: id8j6-b2d-frame-image-blend-nodes

Closed 2026-10-16. Fifth code child of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `core/Runtime/src/Graph/BlendNodes.cpp`: `frame.mix`, `image.mix`, `frame.brightnessScale`,
  `frame.saturation`, `frame.hueShift`, `frame.tint`. Registered in `GraphRunner` (both
  constructors), `/api/nodes` and the PipelineTests copy.
- Blend modes `normal`, `add` (clamped), `multiply`, `screen`, `difference`, per RGB channel
  on 0..1. Result is `a` lerped toward the blended value by `t` (clamped), so `t=0` is always `a`.
  `t` is an optional Float input falling back to the param.
- `frame.mix` zone rule: zones match by id, output has exactly `a`'s zones in `a`'s order and
  `a`'s gamma. A zone missing from `b` passes through unchanged, zones only in `b` are dropped.
- `image.mix`: sizes must match or the node fails (names both sizes). `b` is converted to `a`'s
  pixel format, result keeps `a`'s format and alpha. Only 8-bit 3 or 4 channel mats. Inputs are
  never modified (result is a clone).
- Frame ops: `brightnessScale` multiplies RGB (`factor` >= 0, clamped), `saturation` scales
  about the zone's luma grey (0 grey, 1 identity), `hueShift` rotates HSV hue, `tint` multiplies
  by a required Color input blended by `amount`.

## Verification

- `BlendNodesTests.cpp`: hand-computed result per blend mode for both frame and image,
  mismatched zone sets, gamma/id preservation, `t` input clamp, BGR to RGB conversion, alpha
  kept, size mismatch error. Full suite green (MSVC `build-core-test-win`): 319/319 ctest.

## Lessons

- None filed.

## Carried forward

- `image.mix` is a CPU per-pixel loop (cost "moderate"). Fine for tests and small captures,
  revisit if it sits on a full-resolution hot path.
- `frame.saturation` uses luma grey (0.3/0.59/0.11), not HSV saturation, so it does not match
  `color.toHSV` saturation math exactly.
