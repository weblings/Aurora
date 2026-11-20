# Graph editor: a Whole graph row offers an action only when one fits its code

Id: u8jx2-whole-graph-actions

`Aurora-u8jx.2` (Stage 7b, epic `Aurora-u8jx`). See [[graph-editor-cleanup]] Stage 7; builds on [[u8jx1-problem-copy]].

## What changed

- `web/graph-editor/src/graph/problemActions.ts` (new): `GRAPH_ROW_ACTIONS` keyed by code, `graphRowAction(code)` returns null for any unlisted, missing or inherited code. One entry: `control_node_unknown` gets "Open controls" (the Dashboard controls drawer lists the control and its Remove fixes it).
- No action, on purpose: `graph_cycle` (breaking a loop means choosing a wire), `control_param_unknown`, every structural code, node codes whose node is gone, "Draft would not load", `draft_too_large`. Add node is no longer offered: the loader has no "graph has no output" code it would fit.
- `problems.ts`: `Problems.graphActions` (row text to action), filled by `groupProblems`; `sameProblems` compares it too (coordinator's addition, so a changed action re-renders).
- `ProblemsChip.tsx`: `onAddNode` became `onGraphAction(run)`; a row draws a button only when it has an action. `App.tsx` maps `openControls` to `setDrawer('controls')`.
- `graph-editor-error-shell.mjs`: the 413 row has no button; a new step fakes `control_node_unknown` and `graph_cycle` and checks Open controls opens the drawer and the cycle row has none. `graph-editor-gate.mjs` no longer counts "Add node…" in a row (not run: `Aurora-4ccg`).

## Verification

- Graph editor typecheck clean, vitest 214/214, build ok; `web/ui` node tests 34/34.
- Coordinator re-run under the stack lock: `graph-editor:error-shell` 45 s, `refused-save` 43 s, `top-bar` 12 s, `narrow` 24 s, all pass.
- Agent's screenshot of three Whole graph rows (one with Open controls, two without) looked at.

## Lessons

- none
