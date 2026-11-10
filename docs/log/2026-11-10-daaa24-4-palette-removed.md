# Graph editor: palette removed

Id: daaa24-4-palette-removed

`Aurora-daaa.24.4`, last child of `Aurora-daaa.24`. The 180 px Add node list is gone; the cascade menu ([[daaa24-3-add-node-menu]]) is the only way to add a node.

## State

- Deleted `Palette.tsx`, `graph/palette.ts`, the `.palette*` CSS, `paletteGroups` and its test, and the canvas drag-and-drop add (`PALETTE_DRAG_TYPE`). Dragging a node onto the canvas is no longer a way to add one; the menu adds at the view center. `addFromPalette` became `addFromMenu`.
- The Problems chip's "Add node" action now opens the menu instead of focusing a palette button.
- Checks `add-node`, `control-count`, `save-as-new`, `title-menu` and `gate` no longer use palette selectors. A shared `addNodeByName` in `tools/browser-check/lib/editorMenu.mjs` clicks `+`, searches and picks the first match.

## Measured

- Chrome controls (`graph-editor:control-count`, 1470x900, fake-Hue stack): `builtin.video` 79 -> 26, `builtin.audio` 126 -> 74. Each drops by exactly 53, the palette buttons. Ceilings lowered to 26 and 74.
- Bundle (`vite build`, main chunk): 648.04 kB -> 646.84 kB (gzip 202.51 -> 202.19) against the 650 kB limit. The Autocomplete, ListBox and submenu code were already in at .24.3; deleting the palette freed 1.2 kB. Only 3.2 kB of headroom remain.

## Verification

- `tsc --noEmit` clean, vitest 117 passed (118 minus the removed `paletteGroups` test).
- `add-node`, `save-as-new`, `control-count` pass.
- `title-menu` passes through its palette-dependent steps (Esc with focus outside, outside click, pane drag) and then times out at line 76 (header click, node outside the viewport), identically with the change stashed.
- `gate` times out at line 100 (`Preview paused` after breaking a connection) identically with the change stashed, so its migrated steps (menu add of Gain and Send to output) did not run. The shared helper is the same one `add-node` and `save-as-new` exercise; "Send to output" is a catalog title. No bead is filed for the two baseline failures (see also [[daaa24-3-add-node-menu]]).

## Lessons

- none
