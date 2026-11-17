# Browser checks: tickFirst follows the Tuning controls rename

Id: e4bi16-tickfirst-label

`Aurora-e4bi.16`. The baseline before the controls-panel fan-out found six editor checks (`refused-save`, `kept-copy`, `drawers`, `undo-toast`, `delete`, `edit-loop`) timing out at one step: the shared `tickFirst` in `tools/browser-check/lib/editorMenu.mjs` clicked the node menu item "Show on the Dashboard", which `e8608b87` (the `Aurora-e4bi.15` work) renamed "Tuning controls…". The item still opens the Details drawer with its switches focused, so `detailsChecks` needed no change. `tickFirst` and `graph-editor-clipboard.mjs`'s expected node-menu list now use the new label. Checks only, no product change.

## Verification
- `tsc --noEmit` and `vitest run` in web/graph-editor pass (277 tests).
- All six checks plus `clipboard`, `context-menus`, `save-as-new`, `control-count` and `tooltips` pass (rerun by the coordinator).

## Lessons
- web-testing.md: "A bead that renames visible text greps tools/browser-check for the old string"
