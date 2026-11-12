# Grille dev.10 bump and popover toggle check

Id: w6zq6-grille-dev10-popover-toggle

`Aurora-w6zq.6`. The graph editor moves to Grille `0.1.0-dev.10`, which closes an open popover when its trigger is clicked again and flips a down chevron while its trigger is `aria-expanded`.

## State

- `package.json` and the lockfile are on dev.10.
- The local `chevronUpIcon` swap is gone from the View menu, and also from the title menu and the Zones header, which had the same swap. Grille's `[aria-expanded="true"] > .ui-icon[data-chevron]` rule rotates the icon 180°. The Test caret already used the down chevron.
- New browser check `graph-editor-popover-toggle` (`npm run graph-editor:popover-toggle`): a second click on the trigger closes Add node, View, title and Test caret; the three chevrons rotate while open and return; the Add node search field sits inside the 340px menu.

## Verification

- vitest 132/132, `tsc --noEmit` clean.
- All 19 graph-editor browser checks pass in Chrome, including the new one.

## Lessons

- none
