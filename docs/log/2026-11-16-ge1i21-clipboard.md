# Graph editor clipboard: copy, cut, paste, Select all, Edit menu

Id: ge1i21-clipboard

`Aurora-ge1i.2.1` (P3), built from the `Aurora-ge1i.2` mock decisions. `Aurora-ge1i.2` (the design mock, owner-approved 2026-11-16) and the stage 8 epic `Aurora-ge1i` closed 2026-11-20: all four children were done and GraphEditorCleanup.md already lists stage 8 with its status.

## What changed

- `graph/doc.ts`: pure `copySelection`, `parseClip`, `pasteSelection`, `pasteNote`. The clip is marked JSON (`aurora-graph-clip`) on the system clipboard, so it pastes across tabs. Fresh ids come from `freshNodeId`, only internal wires and the nodes' Dashboard controls come along, unknown types are skipped.
- Singleton = a catalog type with `sink` (the output node), skipped only when the graph already has one, so Cut then Paste works. The catalog has no singleton flag, so this is the editor's own rule (`isSingleton`).
- Top bar: Undo and Redo buttons became an Edit dropdown (`EditMenu.tsx`). Canvas menu gained Paste and Select all, node menu Cut and Copy with plain Delete.
- Keys: Ctrl/Cmd+A, C, X on keydown (canvas and bar only), V through the `paste` event (no permission prompt), Ctrl+Y redo. Cut and copy win over page text a shift-click left selected.
- One edit per paste or cut. Repeat paste of the same clip steps 24 px down and right.
- Checks: new `graph-editor:clipboard`; `gate`, `test-outcome`, `error-shell`, `top-bar`, `narrow` and `context-menus` repointed at the Edit menu (`lib/editorMenu.mjs` `editAction`). `control-count` audio ceiling 10 to 9.

## Verification

- `tsc --noEmit` clean, vitest 253/253 (13 new).
- `graph-editor:clipboard`, `context-menus`, `delete`, `narrow`, `undo-toast`, `tooltips`, `control-count`, `title-menu`, `popover-toggle` and `drawers` pass.
- `graph-editor:top-bar` fails on 32 px vs 31 px button height, as it did before this change (checked at the prior commit, `Aurora-ma8m`).
- `gate`, `test-outcome` and `error-shell` were edited but not run.

## Lessons

- none
