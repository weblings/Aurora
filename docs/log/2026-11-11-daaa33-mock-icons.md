# Grille mock: one icon set, fixed-height bar, drawer icon buttons

Id: daaa33-mock-icons

`Aurora-daaa.33` (icon audit, still in progress) plus mock fixes found while reviewing it. Mock only: `web/ui/Static_GraphEditor_Mocks_Grille/`. The audit table is in `web/graph-editor/README.md` ("Icon audit").

## Mock changes

- Top bar: every control is one fixed 32 px height (`.ge-bar .ui-button`), no Grille change needed since the mock already overrode Grille's padding there. Before: text buttons about 32, icon buttons 28, primary 26. The title dropdown lost its semibold weight and matches the other bar buttons.
- Zones island variant 4 is now "no resize": the same collapsible `Zones` header and chevron, without the small/large button. It had been a headerless squares-only island, which was a miscommunication; the headerless branch and its `.plain` CSS are gone.
- Controls drawer (narrow dock): the Full height / Half height text button is an icon button, and the close `×` is an icon. Both icon buttons are 28 px square; the `×` character was about 20x24.
- One icon style. Vidstack paths (`VS` in `mock.js`): fullscreen enter/exit, x mark, back arrow, add, chevron down/up, play, stop, search. Zest Free paths (`ZEST`): Undo, Redo. Aurora's `warning.svg` for the warning mark. The earlier hand-drawn 1.8 px outline icons were not Vidstack and read about half the weight; the back arrow and the Add node `+` were text characters.
- Icon sizes follow how Aurora and RockyRoad render the same files: 10 px chevron (`dropdown.css`, `editor.css`, RockyRoad `desktop.html`), 14 px back arrow (`forms.css`, `editor.css`), 16 px for the rest (`shell.css` `.top-bar-trailing-icon`). A first pass drew them at 20-24 px inside a negative margin, about twice too big.

## Audit changes

- `fullscreen-arrow.svg`, `fullscreen-arrow-exit.svg`, `x-mark.svg` added to `web/ui/icons`; path data checked identical to `media-icons@0.10.0` `raw/`. `Undo.svg`, `Redo.svg` added from Zest Free (no origin comment in the files; taken on the owner's word).
- Audit rows updated: `✕`, Grille's `×`, undo/redo, a new `+` row (the editor's own Add node button in `App.tsx` is also a `+` character), fullscreen and close for the mock. `THIRD_PARTY_NOTICES.md` lists the new files under Vidstack and Zest.
- Editor code is untouched.

## Findings

- 32-grid Vidstack files carry built-in padding (a chevron fills 18 of 32 units), so a 10 px box is a glyph about 6 px wide. Sizing them as if the box were the glyph overshoots.
- Zest is a 24 grid with 4 units of padding, so at the same box size its glyph is larger than Vidstack's: the editor's icon module has to handle both grids. In the mock the Undo/Redo arrows read the smallest and lightest of the set at 16 px; a 20 px box would match better, not done.
- The mock's outside-click handler closes a popup when the click target is no longer in the DOM. Swapping a clicked button's child icon on click detached the target and closed the drawer; the toggle now holds both icons and CSS shows one.

## Verification

- Headless Chromium (playwright-core from `tools/browser-check`) screenshots and bounding boxes of the top bar, split button, Zones island (open, collapsed, large, no resize), problems chip and the 600 px bottom dock; expand/collapse round trip checked (top 437 to 176 and back). Repo checks not run (mock only).

## Lessons

- none
