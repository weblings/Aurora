# Graph editor: Tuning drawer chrome

Id: e4bi12-drawer-chrome

`Aurora-e4bi.12`. The Tuning drawer head is title, count and the ... menu (Grille's `hideControls` drops the x and the full-height button). A grab tab (`GrabTab.tsx`) sits on the drawer's inner edge in every state and replaces the corner Tuning button. Docked, a click toggles half and full, and a drag or Up and Down steps closed, half, full; full height stops 24 px below the top bar. Beside the side drawer the pill stands upright and a click, drag or Left and Right hide and show it. Hide Tuning in the panel menu is the one-click close, and a bare T on the canvas or top bar toggles Tuning (not in fields, popovers, dialogs or the drawer, not with a modifier or on repeat; Ctrl+J and Ctrl+B are browser keys). The toast sits above the half-height dock and beside a side drawer, and floats above the dock at full height so Undo stays reachable. The drawer edge is 2 px, as in the `Aurora-e4bi.8` mock, so the tab reads as part of the drawer; `.ui-drawer` is set to border-box locally so the edge stays inside the 350 px width. The check helpers `controlsButton`, `controlCount` and `waitControlCount` now read the grab tab and the drawer title.

Control count holds at 11 and 9: the closed tab is a button that replaces the corner button one for one (owner accepted). `Aurora-daaa.37` (width-only dock rule) was not built (owner: skip for now).

## Verification
- `tsc --noEmit`, `vitest run` (290 tests) and `npm run build` pass.
- New `graph-editor:drawer-chrome` check (1100, 700, 400 and 360 px: tab geometry, mouse, keyboard, touch, Hide Tuning, T from the canvas and not from a field, toast with a clickable Undo over the dock). Coordinator re-run: it and 19 other editor checks pass.
- Not checked by eye: the tab, the 2 px edge and the toast at full height.

## Lessons
- none
