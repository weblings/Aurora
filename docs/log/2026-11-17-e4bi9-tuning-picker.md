# Graph editor: Tuning controls picker replaces Details

Id: e4bi9-tuning-picker

`Aurora-e4bi.9`. The node menu has no Details. "Tuning controls…" (hidden on a node without params) opens `TuningPicker.tsx`, a non-modal popover beside the node with a `forms.css` switch per param. It stays open across switches, focuses the first switch without scrolling, and closes on Esc or an outside press. Switching on appends to General, switching off is Remove with the Undo toast. The popover anchors at a point clamped into the window, because a mostly off-screen node made a header-anchored popover overshoot at 360 px. Params in Tuning show a muted Grille dot after the label, with hidden text ", in Tuning" and 'In Tuning as "<label>", <section>.' in the hint. On touch the ... menu starts with the node's short tip, and a tap on a port or param name shows its description (`TapHint.tsx`, nodrag, 44 px tall where the pointer is coarse). `DetailsDrawer.tsx`, `CommitInput.tsx` and `graph/clear.ts` are gone, with the node-pan-under-drawer rule and the dead `.drawer-*` CSS. The check helpers `tickFirst` and `makeEdit` now use the picker.

## Verification
- `tsc --noEmit`, `vitest run` (290 tests) and `npm run build` in web/graph-editor pass.
- Coordinator re-run with `Aurora-e4bi.4` in the tree: all 19 editor checks pass (gate excepted, `Aurora-e4bi.19`). context-menus covers the picker at 1100, 700, 400 and 360 px, Shift+F10, the `Aurora-e4bi.15` param-row menu and a touch tap; drawers covers the dot.
- The coordinator fixed two drawers steps: a click before the hint hover (React Aria modality, see lesson) and the Move to section list gaining New section… from `Aurora-e4bi.4`.
- The narrow check lost its node-clear-of-drawer and no-pan-on-reopen assertions with the Details pan rule.
- Not checked by eye: the picker and the dot. Review note: each switch's name is "Add X to Tuning" even when on.

## Lessons
- web-testing.md: "After a keyboard step, React Aria shows a hover tooltip only after a pointer press"
- agent-coordination.md: "Parallel agents' checks can assert on each other's UI; re-run the whole set once both are in"
