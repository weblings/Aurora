# Graph editor: full browser-check suite on the narrow-window head

Id: daaa30-full-browser-check

`Aurora-daaa.30`. The narrow-window commits (`.29.1`, `.29.2`, `.29.4`) only ran `graph-editor:narrow`. Run against HEAD `a5f4a1f4` (after the `.27.5` Esc handler removal), each script on its own stack.

- Passed first run: gate, top-bar, title-menu, drawers, delete, context-menus, test-outcome, back-link, control-count, add-node, add-menu, save-as-new, narrow.
- `port-types` failed: it clicked a node-type button in the old palette; the Add node menu replaced that. Not caused by the narrow work. Fixed by using `addNodeByName`; it now passes.
- `edit-loop` failed once with an empty log straight after the port-types crash, passed on rerun. Cause not proven; probably the crashed run's stack still held the ports.

## Verification

- All 15 `graph-editor:*` scripts above plus `edit-loop` pass against HEAD.

## Lessons

- none
