# Graph editor: sockets and wires by port type

Id: ex8z-port-type-sockets

`Aurora-ex8z`: every handle and wire was one gray accent, so port types could
not be told apart.

## Done

- `graph/portStyle.ts`: hue by domain (video teal, audio violet, light amber,
  numbers gray), shape by data kind (square bulk, circle value, diamond Angle,
  triangle Trigger). Wires take the source color, Trigger dashed, bulk wider.
- A connection drag tints the line and dims handles of other types.
- Teal `#4fb3bf`, violet `#a58cdc` and amber `#e0a84a` moved to `#38c9a8`,
  `#c58cf0` and `#e5ad3c`: the spec teal/violet failed CVD separation (ΔE 5.8
  deutan). New set passes chroma, CVD (worst ΔE 12) and contrast on `#1a1a1a`.
  The validator's lightness band is a chart-fill rule and was ignored.
- `tools/browser-check/checks/graph-editor-port-types.mjs`
  (`npm run graph-editor:port-types`): all 8 types on the canvas, color and
  shape per type, edge colors, drag tint and dimming.
- `stack.mjs`: `AURORA_VIZ_PORT` passes `--viz-port` to devstack (ComfyUI held
  8000), and Vite spawns with a shell on Windows.

## Verification

Vitest 96 pass, typecheck clean, port-types check passes on the dev server
(Windows). Not covered in a browser: dashed Trigger wires and bulk stroke width
(unit test checks only that edges get a colored stroke). Embedded editor not run.

## Surprises

- Node 24 on Windows throws `spawn EINVAL` for `npx.cmd` without a shell, so
  the `npx.cmd` path noted in [[pvxx11-browser-check]] never worked there.

## Lessons

- none
