# Graph editor: drag Tuning cards and sections

Id: e4bi5-tuning-drag

`Aurora-e4bi.5`. Tuning cards and sections drag by mouse and keyboard. The grip is Grille's `TreeDragHandle` and the 2 px line its `TreeDropIndicator`, both inside the editor's own React Aria Tree: they wrap React Aria's drag Button and DropIndicator, so they work there, and `TuningPanel.tsx` stays off Grille's Tree, which has no slot for double-click Show on node, the empty-section note or the flat list. Drop rules are the pure `dropSection` and `dropControl` in `graph/tuningCards.ts`, with `moveControlNear` in `graph/controls.ts`: a card drops between cards or onto a heading, a section reorders among headings only (never below General), every section folds during a section drag, and one drag is one Undo step. An empty section accepts a card but cannot be dropped first, as in the menu (`Aurora-e4bi.22`). Keyboard: Right to the grip (two from a section row), Enter, arrows, Enter to drop or Esc to cancel, with React Aria's announcements.

## Verification
- `tsc --noEmit`, `vitest run` (295 tests, 5 new) and `npm run build` pass.
- New `graph-editor:tuning-drag` check at 1100 and 400 px (card onto a heading and between cards, section reorder, empty-section drop and refusal, reload, Undo, keyboard drag and cancel, announcements). Coordinator re-run: it and 20 other editor checks pass.
- Not checked: touch drag on a device (a scripted long-press starts no drag), iOS VoiceOver (`Aurora-e4bi.21`), a drag in a scrolled dock list.
- Noted: drop announcements are long, since a card's name is "label, node, param"; Grille's grab cursor on the grip never shows (see lesson).

## Lessons
- web-testing.md: "React Aria drag: the row starts a mouse drag, the grip is for keyboard, and synthetic touch starts none"
