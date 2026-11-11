# Graph editor: circle sockets in four domain colours

Id: d0hv-circle-sockets

`Aurora-d0hv`: the four socket shapes (square, circle, diamond, triangle) were
slow to read at 8-12 px, and the type label, bulk wire width and drag dimming
already tell types apart. Follows the Grille mock ([[ex8z-port-type-sockets]]).

## Done

- `graph/portStyle.ts`: `shape` and `PortShape` removed; hue by domain stays.
  Bulk wires stay wider, Trigger wires stay dashed.
- `editor.css`: `.aurora-handle` and `.add-socket` are circles; the diamond,
  triangle and `data-shape` rules are gone. `GenericNode` and `AddNodeMenu` no
  longer pass a shape.
- The port-style unit test now expects four colours and no shape field (a
  distinct colour/shape pair per type cannot hold with one shape).
- `graph-editor-port-types.mjs` expects a 50% radius with no rotate or clip.

## Verification

- `tsc --noEmit` clean, Vitest 127 pass.
- `npm run graph-editor:port-types` passes (macOS). The first run failed to
  start because another Aurora held port 8215; it passed once that was free.

## Lessons

- none
