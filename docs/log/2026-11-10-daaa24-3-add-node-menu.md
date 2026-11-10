# Graph editor: cascade Add node menu

Id: daaa24-3-add-node-menu

`Aurora-daaa.24.3`, third child of `Aurora-daaa.24`. The cascade Add node menu (form B) is built beside the palette, which stays until `Aurora-daaa.24.4`. `Aurora-daaa.23` is satisfied by the same change: the editor now installs Grille `v0.1.0-dev.6` (submenus from dev.5, `Autocomplete` `autoFocus` from dev.6).

## State

- `AddNodeMenu.tsx`: `Autocomplete` over a `Menu` of seven `SubmenuItem` group rows (no query) or a `ListBox` with "Name matches" and "Description matches" sections (query). Rows show name, input and output socket glyphs (shape and color from `portStyle`) and the summary, falling back to `purpose`; the tip, falling back to `useWhen`, is the hover title.
- `graph/addMenu.ts` (`addGroups`, `searchNodes`) orders the groups by signal flow with "Other" for a missing group, and ranks name or type id matches before the rest. Vitest in `addMenu.test.ts`.
- Opens from a `+` button on the top bar and from Shift+A when focus is on the canvas or `<body>` and not in a text field. A node lands at the view center, through the palette's `addFromPalette`.
- `web/graph-editor/package.json` and the lockfile point at `v0.1.0-dev.6`. The search field takes focus through Grille's `autoFocus` prop; an earlier ref-callback workaround is gone.
- The control-count ceiling for `builtin.video` goes 78 to 79 for the `+` button; `Aurora-daaa.24.4` lowers it when the palette goes.

## Verification

- `tsc --noEmit` clean, vitest 118 passed (including the new addMenu tests).
- `npm run graph-editor:add-menu` passes: open by `+` and Shift+A, Esc and outside click with focus returned, search ranking, ArrowRight opens and ArrowLeft closes a flyout, add by Enter and by click. Screenshots of the search list and a flyout reviewed.
- `graph-editor:add-node` passes. `graph-editor:top-bar` and `graph-editor:title-menu` time out in the view menu and pane-drag steps; they fail the same way on Grille dev.4 with this change stashed, so they predate it (not investigated).

## Lessons

- One filed: [[lesson-webui-testing]] (rebuild the app for API-dependent checks; submenu role lookup).
