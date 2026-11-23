# Graph editor node menu on a multi-node selection

Id: kp8y-multi-selection-context-menu

`Aurora-kp8y`. Right-clicking a box-selected group of nodes showed the browser's native menu. The editor now opens its node menu for the selection.

- Cause: after a box-select, React Flow draws a selection rectangle over the group. It is a sibling of the pane, so a right-click never reached `onPaneContextMenu`. The rectangle only calls `preventDefault` when `onSelectionContextMenu` is passed, and `App.tsx` did not pass it. Not Firefox-specific by the code, though Chrome and Safari were not tried.
- Fix: `onSelectionContextMenu` opens the node menu on the first selected node. Cut, Copy and Delete already act on the whole selection. Tuning controls is hidden for two or more nodes. Tidy is offered for two or more nodes and lays out only the selected ones.
- Shift+right-click still shows Firefox's own menu, which a page cannot override. Left as is.
- Not done: no automated test, because the editor has no browser test setup. Chrome and Safari were not checked.

## Verification
- Typecheck showed no errors in the edited files.
- The owner right-clicked a multi-selection in the dev editor against the real app (fake-Hue stack) and confirmed it works as specified.

## Lessons
- none
