# Graph editor: side drawer narrows and the view keeps the node clear

Id: daaa29-2-drawer-clear

`Aurora-daaa.29.2`. Before: at 700 px a 350 px drawer covered half the canvas and the node Details describes.

- `editor.css` sets `--ui-size-drawer-width: clamp(280px, 40vw, 350px)` on `:root`; Grille sizes the drawer from that token, no Grille change.
- `graph/clear.ts` `clearShift(start, end, limit, margin)` is the one-axis pan rule (16 px margin, never pushes the node's start past the margin, 0 when already clear). The bottom dock (`.29.4`) can call it with the drawer's top edge.
- `App.tsx` runs it (pan only, 150 ms) when Details opens, the selection changes, or the canvas resizes (`ResizeObserver`). The drawer width is read from the `.ui-drawer` element.
- `graph-editor-narrow.mjs` asserts drawer width and that Rescale's box is left of the drawer at 1100, 900, 700 and 520 px.

## Verification

- `npm run graph-editor:narrow` passes; typecheck and Vitest (126, five new for `clearShift`) pass.
- Not asserted at 400 px: Rescale is wider than the 120 px left of a 280 px drawer, so it cannot clear. The bottom dock (`Aurora-daaa.29.4`) covers that width.
- Not checked: the "does not move when already clear" case end to end (covered by `clearShift` unit test only).

## Lessons

- none
