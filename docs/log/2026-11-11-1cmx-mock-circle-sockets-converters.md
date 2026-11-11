# Grille mock: circle sockets and Float/Angle converters

Id: 1cmx-mock-circle-sockets-converters

`Aurora-1cmx`. The Grille mock tries the node-shape changes before the editor builds them (`Aurora-d0hv`, `Aurora-jsjj`, `Aurora-0veq`).

- Every socket is a circle in its domain colour; the diamond and triangle styles are gone. The mock drew all wires at one width, so Image, AudioBuffer and Frame wires are now 3.5 px and Trigger wires dashed.
- `angle.fromFloat` and `angle.toFloat` are mock-only catalog entries in `mock.js` (`catalog.js` untouched), in the Numbers group next to `angle.add`. Drop them when `gen.py` next runs after `Aurora-jsjj` lands.
- New frames: Refused: Float to Angle (toast names the converter) and Auto-insert converter (LFO, inserted Float to Angle, Color from HSV; undo is one step).
- `showFrame` now rebuilds nodes and edges, so a frame that replaces the graph does not leak into the next one.

## Verification

- `node --check mock.js` passes. No browser was available, so the frames were not rendered. Repo checks not run (mock only).

## Lessons

- none
