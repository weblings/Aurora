# Remove Zest Pro undo and redo icons

Id: atpm-remove-zest-pro-icons

`Aurora-atpm` (P1), closed. The Grille audit of 2026-11-24 found `Undo.svg` and `Redo.svg` in `web/ui/icons` are Zest Pro artwork, not Zest Free. They were added 2026-11-11 with no origin comment, "taken on the owner's word" ([[daaa33-mock-icons]]). Grille dropped its own `undoIcon` and `redoIcon` for the same reason in v0.2.2-dev.2.

- Deleted `web/ui/icons/Undo.svg` and `Redo.svg`. Nothing imported them, the editor draws undo and redo as text (EditMenu, ContextMenu), and the demo vendor manifest never listed them.
- `web/graph-editor/README.md`: removed the `undoIcon` / `redoIcon` row from the icon table, it was no longer true.
- `THIRD_PARTY_NOTICES.md`: the Zest Free entry now covers `power-svgrepo-com.svg` and `minus.svg` only, and through Grille the minus and warning icons.
- Old logs that mention the two files are history and were left alone.

## Checked, nothing more to do
- `power-svgrepo-com.svg` is Zest Free. The root README credits it by the zest-free licence file link SVG Repo supplies, and [[daaa33-notices-audit]] already fetched that licence text. The notice stays as it was. Grille's `powerIcon` is OpenMoji because Zest's `power-symbol.svg` is Pro only (the gaps mock log on `feat/ReactPort`), a different file.
- `minus.svg` is Zest Free (owner, 2026-11-24). The other files in `web/ui/icons` are Vidstack (MIT) or Aurora's own.

## Lessons
- [[lesson-planning]]: an icon taken on someone's word needs its tier checked when added.
