# Graph editor: narrow top bar, idle Test drops to its icon, the Problems chip gets a chevron

Id: u8jx91-narrow-top-bar

`Aurora-u8jx.9.1` (build of the `Aurora-u8jx.9` mock, frame #s9-narrow) and `Aurora-u8jx.8` (Problems chip chevron), epic `Aurora-u8jx`. Built together because they touch the same top-bar files.

## What changed

- `SplitTestButton.tsx` `useIconForm`: idle Test shows only its icon when the title would fall under 100 px. The title is measured (the whole `.editor-title-menu` control, dot and chevron included, against its natural width and max-width), so the chip and the name move the switch, not a fixed bar width. A ResizeObserver on the bar and the title drives it and sets `data-icon-form` on the split button, which `editor.css` styles. Hysteresis: in the icon form it returns to the label only when the title would still reach 100 px after giving back the label's measured width (52 px), so it cannot flip-flop. Nothing folds at 450 px and wider. The hook takes the split's element through state, not a ref, because `Hint` swaps the group element when Test becomes disabled. A first build used a fixed `@container` width (about 424 px), which turned Test into an icon at 400 px with no chip and room to spare, so the coordinator sent it back.
- `SplitTestButton.tsx`: names the button for the state: `Test (15s)` or `Test (Live)`, `Stop the test, N seconds left` (`stopName` in `graph/status.ts`), `Take over the test`, `Reconnect` (now with the play icon, shown in the icon form only). The tooltip leads with that name. Wide form names are unchanged, so other checks keep their selectors. A disabled Test keeps its Fix the problems tooltip.
- `ProblemsChip.tsx`: Grille `chevronDownIcon` (sm, default colour) at every width, flipped by Grille's `aria-expanded` rule. No new ARIA.
- Undo, Redo, Back (icon at 519 px and below), keyboard order and Ctrl+Z are unchanged.
- `tools/browser-check`: `graph-editor:narrow` now covers 520, 450, 420, 400 and 360 px with and without a problem (bar never wraps or overflows, the form follows the measured title, Test named by aria-label and tooltip in the icon form, chip chevron present), logs the title, spare and Test widths per width, sweeps 460 to 360 and back asserting no flip-flop, and with `SHOTS` saves the bar. `graph-editor:popover-toggle` also checks the chip chevron flips.

## Verification

- Editor `tsc --noEmit` clean, vitest 236/236 (`stopName` cases added).
- `graph-editor:narrow`, `popover-toggle`, `tooltips`, `test-outcome`, `preview` and `refused-save` pass.
- `graph-editor:top-bar` (32 px vs 31 px, `Aurora-ma8m`) and `control-count` (builtin.video 12 over 11, `Aurora-tj18`) fail as they did before this change.
- Measured title (1 problem): 123 px down to 700, 116 at 520 to 400, 90 at 360 (icon form from 420 down). With no problem: 105 px at 520 to 400 and 102 at 360, Test keeps its label throughout.
- Screenshots of the bar at 520, 450, 420, 400 and 360 px, with and without a problem, were looked at against the mock.

## Lessons

- none
