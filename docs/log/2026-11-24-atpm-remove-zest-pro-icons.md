# Remove Zest Pro undo and redo icons

Id: atpm-remove-zest-pro-icons

`Aurora-atpm` (P1), closed. The Grille audit of 2026-11-24 found `Undo.svg` and `Redo.svg` in `web/ui/icons` are Zest Pro artwork, not Zest Free. They were added 2026-11-11 with no origin comment, "taken on the owner's word" ([[daaa33-mock-icons]]). Grille dropped its own `undoIcon` and `redoIcon` for the same reason in v0.2.2-dev.2.

- Deleted `web/ui/icons/Undo.svg` and `Redo.svg`. Nothing imported them, the editor draws undo and redo as text (EditMenu, ContextMenu), and the demo vendor manifest never listed them.
- `web/graph-editor/README.md`: removed the `undoIcon` / `redoIcon` row from the icon table, it was no longer true.
- `THIRD_PARTY_NOTICES.md`: the Zest Free entry now covers `power-svgrepo-com.svg` and `minus.svg` only, and through Grille the minus and warning icons.
- Old logs that mention the two files are history and were left alone.

## Not resolved
- `power-svgrepo-com.svg` has an SVG Repo header and no licence text. Its Zest Free origin could not be verified offline, so the notice now says "unverified". It is still used by the Dashboard demo (`DashboardScreen.js`), `GapsMock.tsx` and the static mocks. Needs an owner check against the zest-icons repo.
- `minus.svg` was not compared against zest-free either. The other files in `web/ui/icons` are Vidstack (MIT) or Aurora's own.

## Lessons
- [[lesson-planning]]: an icon taken on someone's word needs its tier checked when added.
