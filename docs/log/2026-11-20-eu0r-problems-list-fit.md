# The Problems list fits its panel with no sideways scroll

Id: eu0r-problems-list-fit

`Aurora-eu0r`. Owner screenshot: the Problems popover showed a horizontal scrollbar on hover because the list did not fit its panel.

## What shipped
- `editor.css`: `.editor-problem-list` hides horizontal overflow and caps its width at `min(320px, 100vw - 32px)`. Rows are `border-box` and long text wraps (`overflow-wrap: anywhere`).
- `checks/graph-editor-narrow.mjs`: a closing pass opens the list at 1100, 700, 400 and 360 px and asserts `scrollWidth <= clientWidth` and that it stays inside the window.

## Verification
- Owner: the fix works in the dev-server editor.
- `graph-editor:narrow` passes. It also passes with the CSS reverted, because its one node-level problem is short. The overflow needs a long Whole graph row with an action button, which the check does not build.

## Lessons
- none
