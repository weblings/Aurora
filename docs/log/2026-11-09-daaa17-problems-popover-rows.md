# Graph editor: problems popover rows stack the node id above the message

Id: daaa17-problems-popover-rows

`Aurora-daaa.17`. With one problem the popover put the bold node id at the left and wrapped the message into about 230 px beside it, five lines tall (seen in the embedded build, [[daaa13-embedded-run]]).

## State

- `ProblemsChip.tsx` and `editor.css`: each row stacks the node id above the message, so the message gets the row width (commit de33ff9).

## Verification

- Not run here: a fresh browser or embedded-build check of the popover.

## Lessons

- Lessons: none.
