# Graph editor adopts Grille icons

Id: s1t75-grille-icons

`Aurora-s1t7.5`. Every icon in `web/graph-editor/src` is now Grille's (`Icon` and the `*Icon` data exports from `@weblings/grille` 0.1.0-dev.9, `size="sm"`): back arrow, chevrons, undo, redo, add, node menu, warning, arrow up and down, x-mark, minus. No `web/ui/icons` import and no icon glyph is left. Undo and Redo are icon buttons at every width, so `BarMoreMenu.tsx` went. The ◆ "On the Dashboard" mark went with the `onDashboard` prop and the `dashboardParams` field; the ● unsaved dot is a CSS circle. The mock inlines Grille's path data, the README audit became a short Icons section, and `THIRD_PARTY_NOTICES.md` says the Vidstack and Zest icons now arrive through Grille.

## Verification

- `tsc --noEmit`, vitest (130 passed) and `vite build` pass.
- All 18 `graph-editor` browser checks pass; `:drawers`, `:narrow` and `:back-link` were updated (no on-node marks, Undo and Redo icon buttons at every width, SVG back arrow). `:control-count` reports `builtin.audio` at 9, ceiling left at 10.
- Not looked at in a screenshot: icon optical size next to text in the bar and on nodes.

## Lessons

- none
