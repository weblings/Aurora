# Graph editor: one naming dialog on Grille

Id: e4bi13-naming-dialog

`Aurora-e4bi.13`. The editor's naming dialogs moved onto Grille. One `NameDialog` serves Save as new, Rename effect, section names (mode built and unit-tested, wired by `Aurora-e4bi.4`) and the Edit control state with Label and a 3-row Tooltip (built and unit-tested, wired by `Aurora-e4bi.3`). The rules live in the pure `graph/naming.ts`. Messages are Grille's `MessageRow` with error and notice tones only, inside a `role="status"` wrapper that stays mounted. An error blocks the confirm and marks the field invalid. A taken Save as new name is a notice naming what it saves as, and the dialog opens on the next free "(Copy)" title. An empty name only disables the confirm (the old "Name the new effect first" note is gone, as in the mock). `NewerSavedPrompt.tsx` also moved to Grille's Dialog, and every `editor-name-*` rule is gone. Browser checks find the field as "Effect name".

## Verification
- `tsc --noEmit` and `vitest run` in web/graph-editor pass (282 tests, 5 new in `naming.test.ts`).
- Coordinator re-run: save-as-new, title-menu, refused-save, kept-copy, top-bar, undo-toast, failed-save, drawers, context-menus, clipboard, narrow, control-count, tooltips and edit-loop pass. `gate` fails at a stale bar Undo step that predates this bead (`Aurora-e4bi.19`).
- Not checked by eye: dialog width and the Grille title against the mock's board.

## Lessons
- none
