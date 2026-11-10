# Graph editor: Delete key and the dropped-controls toast

Id: daaa27-2-delete-key

`Aurora-daaa.27.2`. Part of stage 4 ([[daaa27-1-context-menus]]).

- `deleteKeyCode` is `['Backspace', 'Delete']`.
- `deleteNodes` in `App.tsx` is the one delete path for keys and the menu. If the nodes own Dashboard controls, a toast reads `Removed N Dashboard control(s) with <names>`. A control without a label is named `<node title> <param>`; more than three names show the first three and `N more`. No confirm, no Undo button.
- **Surprise:** React Flow emits `remove` for the node and its wires separately, and the old handlers made one history entry each, so one undo left the wires gone (5 edges, not 7). Present before this bead for Backspace. Document edits now come from `onDelete` (one entry); the change handlers only update view state.

## Verification

- `tsc` and Vitest (118) pass. New `graph-editor:delete` browser check passes: Delete and Backspace delete and toast, one undo restores node, wires and controls, redo removes them again and one undo restores, no toast for a node without controls. A two-node delete toasts the total and one undo restores both nodes, wires and controls. title-menu and context-menus checks still pass.
- Not checked: redo after a menu-triggered delete (same `deleteNodes`); the `N more` cap (needs more than three names); how a long toast wraps; nodes plus a separately selected wire; the remaining browser checks.

## Lessons

- Filed in [[lesson-components]]: React Flow node and edge `remove` changes make two undo steps unless the edit comes from `onDelete`.
