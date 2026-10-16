# B0: Float and Trigger port types (Aurora-id8j.1)

Id: id8j1-b0-float-trigger-ports

Closed 2026-10-16. First child of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `PortType::Float` (plain `float` in `GraphValue`) and `PortType::Trigger`
  (`struct Trigger { bool fired; }`). Loader and registry accept both through
  the existing type-equality check. No loader code changed.
- `Trigger` is sent every tick, `fired` true only on the tick it happens. An
  idle `Absent` would propagate and stall every dependent node.
- `audio.features` gained `rms`, `onsetStrength`, `centroid` (Float) and
  `onset` (Trigger) beside the unchanged `features` port. An empty buffer
  makes all five outputs Absent.
- G0 frozen format in [[node-graph-pipeline]] amended for both changes.

## Verification

- Bad-graph corpus: Float into Trigger, Trigger into Float, Float into Color,
  missing required Float input. Round-trip and `audio.features` scalar-port
  tests added.
- Built-in graphs and audio parity goldens unchanged. Suite 250/250 (MSVC,
  `build-core-test-win`).

## Carried forward

- `Float` has no non-finite guard on the port itself. Math nodes (B2a) own that,
  per the Float/Angle rule in [[node-graph-pipeline]].
- 1 lesson filed (Trigger sent every tick). The `build/` WSL-cache gotcha is
  filed in build-toolchain.
