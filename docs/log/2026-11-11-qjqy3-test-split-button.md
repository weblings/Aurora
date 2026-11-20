# Test split button in the graph editor

Id: qjqy3-test-split-button

`Aurora-qjqy.3`. The top bar's status pill, Test on lights, countdown and Revert are one split button `[▷ Test ⌄]` (`SplitTestButton.tsx`). The caret menu picks Once (15 s) or Live (until stopped) and starts that test; the last pick is the main part's default. The label is the state: `Test`, `Stop 0:12` (Once), `Stop` (Live), `Take over`, `Reconnect`. Problems and Cannot reach Aurora disable it with the reason as tooltip. The bar has no status text. The status rule in [[graph-editor-cleanup]] is rewritten: `pickStatus` also returns where each state shows (button, banner, nowhere). Ranks 3 and 6 are a banner (after Retry and Restore, one banner at a time), 4 and 5 the button's labels, 7 nothing (chip, stale tint). A Once test reaching 15 s (`confirm_timeout`) is now a quiet end with a toast. `header[data-preview]` exposes the state label to the browser checks.

Surprise: `.editor-header > .ui-button { flex: none }` out-specified `.editor-title-menu`, so the title never shrank; the status text used to absorb the squeeze. Without it the 400 px bar overflowed by 14 px with the chip showing. The title rule is now `.editor-header > .editor-title-menu`.

## Verification

- Vitest 132, tsc, build. App rebuilt first (the stack's binary predated the mode API). Browser checks passing: top-bar (new split case: Live from the menu, bare Stop, default mark), narrow (split button after Undo, reads Test, disabled with the problems tooltip at 1100 to 400 px), edit-loop with SLOW (Once ends at 15 s with a toast), gate, test-outcome, zones, corners, title-menu, drawers. Not run: the remaining graph-editor checks that do not touch the bar.

## Lessons

- none
