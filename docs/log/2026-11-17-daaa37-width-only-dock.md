# Graph editor: drawers dock at the bottom by width only

Id: daaa37-width-only-dock

`Aurora-daaa.37`. `DOCK_BOTTOM` in `web/graph-editor/src/useMedia.ts` is now `(max-width: 649px)`, without the `max-aspect-ratio: 3/4` clause, so wide portrait windows keep the side drawer. Why (owner, from the `Aurora-e4bi.1` mock review): the side keeps 20 to 51 percent more canvas area from 800x1280 to 1440x2560, and a one-column drawer body leaves a wide dock mostly empty. The planning doc, the graph editor README, the Grille mock README and `mock.css` state the width-only rule.

## Verification
- `tsc --noEmit` and `vitest run` (295 tests) in web/graph-editor pass.
- `graph-editor:narrow` adds 900x1400, which must open on the side. 400x800 still docks, and 700x900, 1000x600 and 1470x700 stay on the side.
- Coordinator re-run: narrow, drawers, drawer-chrome, context-menus and control-count pass.
- The acceptance line's "both drawers" means one now: Details is gone (`Aurora-e4bi.9`), so only Tuning was checked.
- `Aurora-tj18` closed with no change in the same session: `graph-editor:control-count` measured `builtin.video` 11 (ceiling 11) and `builtin.audio` 9 on HEAD, so the 12th Preview island control it reported is gone and the owner's raise-the-ceiling call was moot.

## Lessons
- none
