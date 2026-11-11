# angle.fromFloat and angle.toFloat

Id: jsjj-angle-converters

`Aurora-jsjj`: Float and Angle are separate port types, so an lfo or the audio centroid could not set a hue and an Angle could not feed a Float input. Two converter nodes close the gap without touching the wiring rules or the G0 format. Follows [[z6kw-port-type-glossary]] and the Grille mock's mock-only converters ([[1cmx-mock-circle-sockets-converters]]).

## Done

- `angle.fromFloat` (`ColorNodes.cpp`, group Numbers): degrees = value × `scale` (default 360, so 0..1 is one turn), wrapped to 0..360; negative scale reverses. Value, scale or product non-finite fails the node.
- `angle.toFloat`: degrees ÷ `scale` (default 360, so 0..1). Non-finite angle or scale, or scale 0, fails the node.
- Both carry purpose, useWhen and example; summary and tip name no type id (a catalog test enforces that).
- Loader `port_type_mismatch` appends "convert it with an angle.fromFloat / angle.toFloat node" for Float→Angle and Angle→Float; the editor's `refuseConnection` says the same.
- The Float and Angle lines of the port type glossary (`GraphTypes.cpp`, `nodes.json`, and [[node-graph-pipeline]]) now name the converter.
- `server-samples/nodes.json` refreshed by hand (the two entries after `angle.add`, plus the glossary lines), not from a live `/api/nodes`; the catalog tests pass against it.

## Verification

- Core runtime tests 198/198 and pipeline tests 162/162 (scaling, wrap, negative, non-finite, overflow, zero scale; two new bad-graph corpus cases naming the converter).
- Graph-editor vitest 129 passed, `tsc --noEmit` clean.

## Not done

- The Grille mock still ships its own mock-only converters; swapping them for the real catalog entries is left to `Aurora-0veq` (auto-insert on drop).
