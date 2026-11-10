# Graph editor: Inspector removed, checks migrated

Id: daaa27-4-inspector-removed

`Aurora-daaa.27.4`. Closes stage 4 ([[daaa27-3-drawers]]).

- `Inspector.tsx` and its `.inspector` CSS are gone; the drawers' classes are renamed `inspector-*` to `drawer-*`.
- Checks migrated: edit loop, delete and `lib/editorMenu.mjs` (`makeEdit`, new `tickFirst`, `openDetails`, `controlCount`) tick through the node menu's Show on the Dashboard and read the count from the canvas button. The gate script had no `.inspector` selectors.
- New: `graph-editor-drawers.mjs`. Context-menus check now asserts Add node lands at the right-click position. Menus, Shift+F10, Delete key and toast were already covered by `.27.1`/`.27.2` checks.

## Measurements

- Chrome controls at 1470 px: **9** on Screen colors (`builtin.video`) and **9** on `builtin.audio` (was 26 / 74); mock target 11. Ceiling set to 9.
- Bundle (`vite build`): JS 653.84 kB (204.21 kB gzip), CSS 48.42 kB (8.51 kB gzip); under the 1000 kB tripwire.

## Verification

- `tsc`, Vitest (121) pass. On the dev server: drawers, delete, context-menus, control-count, edit loop pass.
- Embedded Mac build (`cmake --build build/mac-app`, `AURORA_EDITOR=embedded`): drawers, delete, context-menus, control-count, title-menu, add-menu, edit loop and gate pass.
- Not checked: Windows and Linux, narrow windows.
