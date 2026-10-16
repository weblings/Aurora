# B2c: color and palette nodes, gradient param (Aurora-id8j.5)

Id: id8j5-b2c-color-palette-nodes

Closed 2026-10-16. Fourth code child of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `core/Runtime/src/Graph/ColorNodes.cpp`: `color.fromHSV` (hue Angle required,
  saturation and value optional Float inputs falling back to same-named params, clamped
  0..1), `color.toHSV`, `color.brightness` (weighted luma, not HSV value), `color.mix`
  (RGB, `t` input or param, clamped), `color.hueShift` (`degrees` input added over param),
  `color.complement` (+180), `color.fromGradient`, `palette.randomAnchor`, `palette.pick`.
- New `ParamKind::Gradient` / `Gradient` value: JSON `[{"pos": 0..1, "color": "#rrggbb"}]`,
  2 to 16 stops, ascending pos. Loader rejects anything else naming node and param.
  `/api/nodes` serves it as kind `gradient` with a `default` stop list.
  `color.fromGradient` blends in RGB, clamps t, holds the end stops outside their range.
- `palette.randomAnchor`: picks one of the six pair anchors (0, 30 ... 150) on the first tick
  and holds it. `seed` is an OptionalFloat (whole number, unset is random). `resetState`
  re-picks, deterministic when seeded.
- `palette.pick`: `side` enum anchor or complement, Angle in and out, wraps at 360.
- Registered in `GraphRunner` (both constructors), `/api/nodes` and the PipelineTests copy.

## Verification

- `ColorNodesTests.cpp`: per-node cases, seeded determinism over 40 seeds, hold across ticks,
  gradient sampling and 9 malformed-gradient load rejects, hex helpers, a randomAnchor ->
  pick -> fromHSV chain. Full suite green (MSVC `build-core-test-win`): 301/301 ctest.

## Lessons

- 1 filed: a new ParamKind has six switch sites (architecture-process).

## Carried forward

- `AudioProcessing::randomAnchorHue()` still uses an unseedable static rng. The node does not
  share it, so B3 parity must pin the node's `seed` and the compound's `fixedAnchorHue`
  to the same anchor instead of comparing random picks.
- Color round trips go through uint8 (`fromHSV`/`toHSV`), so parity checks on color need a
  1-channel tolerance.
- Gradient has no editor widget yet, the web UI sees it as a `text` descriptor.
