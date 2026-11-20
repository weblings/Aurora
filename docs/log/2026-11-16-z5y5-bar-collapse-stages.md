# Graph editor: the header collapses by measured stage, not by three separate rules

Id: z5y5-bar-collapse-stages

`Aurora-z5y5` (P3, 1.2.0). Dashboard and the Test button lost their text at widths that still had room.

## What changed

- Cause: three unrelated rules. Dashboard dropped its label at a fixed 519 px viewport, the chip text at a fixed 649 px, and Test by measuring the title. The Edit menu (fixed width) was added after the narrow-bar mock, so the title reached 100 px at a wider window than the mock assumed.
- `barStage.ts`: one `useBarStage` hook and a pure `pickStage`. It tries stages 0 to 3 on the real bar before paint and keeps the first where the title still has min(100 px, what it wants). The answer depends only on the layout, so there is no hysteresis and no flip-flop.
- Order, owner 2026-11-16: the title shrinks to 100 px, then the Dashboard label goes, then idle Test becomes its icon, then the chip text becomes its count. A control that is absent gives nothing back, so it is skipped.
- CSS keys off `data-back-icon`, `data-test-icon` and `data-chip-compact` on `.editor-header`. `SplitTestButton` takes `iconForm` as a prop (for its accessible name), `ProblemsChip` renders both texts and CSS shows one, the Dashboard link always has `aria-label="Dashboard"`. `TIGHT_BAR` and the chip's `COMPACT_BAR` use are gone (`COMPACT_BAR` stays for the unsaved mark and the 18ch title cap).
- The 100 px floor is unchanged (owner decision in [[u8jx9-narrow-bar-mock]], built in [[u8jx91-narrow-top-bar]], whose `useIconForm` this replaces).
- `graph-editor:narrow` now asserts per width that the stage is the first one that fits (the title is re-measured at the stage before and must be under its floor), plus a 700 to 360 and back sweep where the way up retraces the way down.

## Verification

- Editor `tsc --noEmit` clean, vitest 260/260 (`barStage.test.ts` added).
- `graph-editor:narrow`, `back-link`, `popover-toggle` and `tooltips` pass. Measured stages: no problem 0 down to 420 px and 1 at 400 and 360, with a problem 0 down to 560, 1 at 520 to 480, 2 at 460 to 420, 3 at 400 and below.
- Two checks were already stale and are fixed: `test-outcome` clicked a bar Undo button the Edit menu replaced (now `editAction(page, 'Undo')`), and `refused-save` expected a dashed ping border that `Aurora-23wu` made solid. Both pass.
- `top-bar` (`Aurora-ma8m`) now passes: Grille's button is 8 + one text line + 8, so 31 px on a Mac (15 px line) and 32 px on Windows (16 px). The check asserts one height of 31 or 32 for every bar button. It also had a second stale assertion from `Aurora-l8ua` (built-ins now sit in a Built-in sub-menu of New), fixed.
- Not looked at: screenshots of the bar at the new stage boundaries.

## Lessons

- none
