# Graph editor: gate check fixed

Id: daaa26-gate-status

`Aurora-daaa.26`. `graph-editor:gate` timed out at `Preview paused` (line 100) after breaking a connection, so its migrated add-node steps ([[daaa24-4-palette-removed]]) had never run.

## Cause

Two, one in the editor and one in the check.

- Editor: `pickStatus` in `status.ts` ranked `reloadError` (rank 3) above `valid === false`. A draft with problems is also flagged `draft_invalid` by the stream, so the status read `Draft would not load` instead of `Preview paused`. `summarize` in `loop.ts` already had the order the other way. Not the `Connecting` wording change of [[daaa21-connecting-status]].
- Check: fit view's 60% floor ([[daaa25-browser-check-timeouts]]) leaves `gain_hue` at x=-123 and, after a pan, `floor_hue` behind the inspector, so the rewire drag and the node move missed.

## Fix

- `pickStatus` shows `reloadError` only when `valid !== false`; the problems chip explains the rest. Unit test added. The gate's "would not load" step still passes: its graph is valid but cannot start an input.
- Gate: `panTo` drags the empty pane until the target is in view, before the rewire drag and the node move.

## Verification

`graph-editor:gate` passes end to end on the fake-Hue stack, dev server, including the menu-added Gain and Send to output steps. vitest `src/graph` 118 passed. Embedded build not rerun.

## Lessons

- none beyond [[lesson-web-testing]] (a check that assumes a node is in the window breaks under fit view's floor).
