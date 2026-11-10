# Naming a new effect in a modal dialog

Id: daaa19-name-dialog

`Aurora-daaa.19`, with `Aurora-daaa.22` (Grille `Modal`, installed as `v0.1.0-dev.4`, which this builds on).

## State

- `NameDialog.tsx` (Grille `Modal` + `Dialog`) names a new effect: Save as new, and Save or Save and apply on a built-in. Empty name disables confirm and shows the note. Cancel, Escape and a scrim click write nothing; focus returns to the title button.
- Save on an existing custom effect writes directly. `Rename…` (custom only) opens the same dialog pre-filled and sets the title as an unsaved edit.
- The title menu lost its Name field; [[graph-editor-cleanup]] direction 4 and the status table match.
- Browser-check helpers: `setName` uses Rename on a custom effect and holds the name for the next save dialog on a built-in; `pickAction` leaves the dialog open. Three checks that dirtied a built-in through its title now tick a dashboard control (`makeEdit`).

## Verification

- `typecheck` and vitest (114) pass. Browser checks passed: `edit-loop`, `save-as-new`, `test-outcome`, `add-node`.
- `top-bar` fails at its "Fit view" step with and without this change, so its new dialog assertions (Cancel/Escape/scrim, focus return) have not run. `gate` times out waiting for a status at line 100; not checked against a clean tree.

## Lessons

- Lessons: none.
