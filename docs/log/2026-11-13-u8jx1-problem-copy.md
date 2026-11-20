# Graph editor: graph problems and refused test starts read in people's words, from one table in web/ui

Id: u8jx1-problem-copy

`Aurora-u8jx.1` (Stage 7a, epic `Aurora-u8jx`). See [[graph-editor-cleanup]] Stage 7.

## What changed

- `web/ui/problemCopy.js` (new): the code-to-copy table, plain JS next to `messages.js` so the shell can reuse it (7d, `Aurora-u8jx.15`). Keyed by plain strings and looked up with `Object.hasOwn`; an unknown, missing or inherited code returns the server's text. No union or switch: 7c and 7d add entries to `COPY`. An entry is a string or a function of `{node, port, param, options}`.
- Written copy for input_missing, output_unregistered, param_option_unknown (lists up to 5 choices), node_type_unknown (suggests the nearest type the server sent), output_multiple_senders (names the Mix frames node), graph_cycle, node_construct_failed, param_invalid, control_node_unknown, control_param_unknown. The 26 structural codes in `GraphLoader.cpp` share one message. Graph issues are called problems, never errors (a unit test checks no entry says "error").
- Refused test starts and stops: no_draft, invalid_session, invalid_body, invalid_mode get copy; draft_changed and no_test moved from `api.ts` into the table unchanged; `cannot_test` keeps its server message (already plain).
- `web/graph-editor/src/graph/problems.ts`: `groupProblems` words each server issue with `describeIssue`, so the popover rows, the Whole graph rows and the node badge, port and param messages all read the table; `ProblemsChip.tsx` and `GenericNode.tsx` needed no edit. Runtime preview issues are untouched (7c).
- `web/graph-editor/src/api.ts`: `refusal()` goes through `problemCopy`.
- Server messages are unchanged.

## Verification

- `web/ui` `node --test` 34/34 (8 new); graph editor typecheck clean, vitest 211/211, `npm run build` ok.
- Coordinator re-run under the stack lock: `graph-editor:refused-save` 43 s, `test-outcome` 18 s, `top-bar` 11 s, `error-shell` 42 s, `narrow` 24 s, all pass. No browser check asserts issue text.
- `graph-editor:gate` fails at "took the lights" (heartbeat path); it fails the same way with the web and check files of 4791ed9c, before this session's beads. Filed as `Aurora-4ccg`.
- Popover screenshot with crafted issues looked at (agent's mock script in the session scratchpad).
- Left for 7b: the Whole graph row still offers Add node... for every code, structural ones included.

## Lessons

- Updated "Before attributing a failing check to the change under review" in [[lesson-agent-coordination]]: swap files from the repo root, and restore with checkout before stash pop.
