# Graph editor: bottom dock for drawers in narrow or portrait windows

Id: daaa29-4-bottom-dock

`Aurora-daaa.29.4`. Before: below ~650 px a side drawer covered most of the canvas.

- `useMedia.ts` `DOCK_BOTTOM = '(max-width: 649px), (max-aspect-ratio: 3/4)'`; `App` passes `side` (`bottom` or `right`) to both drawers. No user override yet. Half height and the half/full toggle are Grille's (`side='bottom'`, uncontrolled).
- The pan rule from `.29.2` now runs on the vertical axis against the dock's top edge. It skips when the sheet is full (it covers everything) and re-runs when the dock resizes, so going full back to half re-clears the node.
- Thresholds kept as designed (650 px, aspect 0.75) after the 400x800 screenshot: node sits above the sheet. 700x900 (aspect 0.78) stays on the side.
- `graph-editor:narrow` adds 400x800 (bottom, half, toggle full and back by keyboard, node above the sheet, Esc closes), 700x900 and 1470x700 (side); the older width loop asserts the side width only when the drawer is on the side (520 and 400 px at 800 high are now docked).

## Verification

- graph-editor `tsc`, Vitest (126) pass; `npm run graph-editor:narrow` passes.
- Not done: container queries in the drawer bodies (content already fits at 400 px in the screenshot).

## Lessons

- none
