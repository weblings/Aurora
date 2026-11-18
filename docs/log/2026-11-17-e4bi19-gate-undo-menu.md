# Browser checks: the gate undoes through the Edit menu

Id: e4bi19-gate-undo-menu

`Aurora-e4bi.19`. `graph-editor:gate` timed out at its Undo step: it clicked bar Undo and Redo buttons that went away when the Edit menu arrived (`graph-editor:clipboard` asserts the bar has none). Its four Undo and Redo clicks now use `editAction(page, 'Undo' | 'Redo')` from `lib/editorMenu.mjs`, picking the Edit menu item by name. Assertions unchanged. Checks only, no product change.

## Verification
- `npm run graph-editor:gate` passes, 30 s (coordinator re-run). It failed at this step on the base commit.
