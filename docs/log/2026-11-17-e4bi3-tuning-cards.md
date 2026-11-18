# Graph editor: Tuning cards with the card menu and select-node

Id: e4bi3-tuning-cards

`Aurora-e4bi.3`. The Dashboard controls list became Tuning cards (`TuningPanel.tsx`, a React Aria Tree taking a controls array, the ui object and a graph name, ready for sub-graphs). Each card shows its effective label and has a menu: Edit… (the `Aurora-e4bi.13` dialog, an empty label drops the key), Move up and down within its section (`moveControlInSection`), Move to section, Show on node and Remove (shared `removeFromTuning`, "Removed X from Tuning." with Undo). Section headings are read-only until `Aurora-e4bi.4`. Show on node, double-click and Enter select the node, fit the view and ping the param row (2 px ring inset 4 px, shell-ping's 1375 ms timing, own keyframes so the ring stays inside the node). The arrow buttons and "No label" line are gone, and the drawer, corner button and node-delete toast say Tuning. Toasts now sit beside a side drawer and above the bottom dock, so Undo stays reachable at 400 px. Pure rules in `graph/tuningCards.ts`.

## Verification
- `tsc --noEmit` and `vitest run` in web/graph-editor pass (289 tests).
- Coordinator re-run: drawers (new card-list steps at 1100 and 400 px), context-menus, delete, undo-toast, corners, error-shell, control-count, narrow, clipboard, save-as-new, kept-copy, refused-save, top-bar, title-menu, tooltips, failed-save and edit-loop pass.
- Not checked by eye: the cards and the toast offset. Enter on a card row has no direct check (double-click does).
- Follow-ups: `Aurora-e4bi.20` (problem copy still says Dashboard control); toast offset noted on `Aurora-e4bi.12`.

## Lessons
- none
