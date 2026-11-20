# Graph editor: Tuning sections, panel and section menus

Id: e4bi4-tuning-sections

`Aurora-e4bi.4`. Tuning's section headings are accordions with a ... menu (Rename, Move up and down, Delete; none on General), and the drawer head has a panel menu (Add section, Collapse all, Expand all) built as an item list `Aurora-e4bi.12` extends. Add and Rename use the `Aurora-e4bi.13` naming dialog, refusing General and case-blind duplicates. Move to section ends with New section…, which creates the section and moves the control. Collapse state is local to the drawer; empty sections persist in the graph's `#sections` key. Pure helpers `sectionMenu`, `moveSection` and `moveToNewSection` in `graph/tuningCards.ts`.

Limits: a stored empty section cannot lead the list, because `deriveSections` places it after the section it followed, so that move is disabled (`Aurora-e4bi.22`). An empty section has no child rows, so Left and Right do not toggle it (the chevron does). Enter and Space on a heading are untested. iOS VoiceOver is unchecked (`Aurora-e4bi.21`).

## Verification
- `tsc --noEmit`, `vitest run` (290 tests) and `npm run build` pass.
- New `graph-editor:tuning-sections` check at 1100 and 400 px, seeded through the API; it and the other 18 editor checks pass on the coordinator's combined re-run with `Aurora-e4bi.9`.

## Lessons
- none
