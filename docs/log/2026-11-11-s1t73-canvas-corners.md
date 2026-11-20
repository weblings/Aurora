# Graph editor canvas corners match the Grille mock

Id: s1t73-canvas-corners

`Aurora-s1t7.3`. `+ Add node` is a labelled canvas button top-left (out of the bar); Dashboard controls is bottom-right with a muted count; the minimap sits inside the View menu's bottom-left island, directly above the zoom button, and the menu opens above it (popover anchored to the island, `top start`); React Flow's credit is bottom-centre. Drawer rules are CSS on `body:has(.ui-drawer[...])`: a side drawer shifts Dashboard controls left, a bottom dock lifts the bottom panels, `data-expanded` hides them.

## Verification

- New `graph-editor:corners` check at 1280x800, 1000x600, 700x900, 400x800, with and without a drawer, minimap on, dock half and full: passing. `top-bar`, `add-menu`, `add-node`, `context-menus`, `drawers`, `narrow`, `control-count`, Vitest (133) and `tsc` pass.

## Lessons

- React Flow's centred panels carry a built-in `translateX(-15px)` (filed in layout-css).
