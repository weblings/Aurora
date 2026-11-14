# Graph editor: a node that fails during the preview reads "Runs, but this node fails", through 7a's table

Id: u8jx3-runtime-wording

`Aurora-u8jx.3` (Stage 7c, epic `Aurora-u8jx`). See [[graph-editor-cleanup]] Stage 7; uses the table from [[u8jx1-problem-copy]].

## What changed

- Core: `GraphPreview::Error` carries `code` (default `node_tick_failed`); both preview serializations in `PreviewRoutes.cpp` (the SSE `preview` event and the summary route) emit it. The server `message` is unchanged for agents and MCP. `docs/api/openapi.yaml` lists the field. `GraphPreviewTests.cpp` checks the code on the failing-node test.
- `web/ui/problemCopy.js`: entry `node_tick_failed`. A node in the document (its row or badge already names it) reads `Runs, but this node fails: <reason>`; a node outside it is a Whole graph row reading `Runs, but "<id>" fails: <reason>` (no action, 7b's default); no node at all reads `a node`. The reason is the server's message without a trailing period.
- `web/graph-editor/src/graph/problems.ts`: runtime issues go through `describeIssue` (code defaults to `node_tick_failed` from an older server); `frame.ts` keeps `code`.
- No popover reordering: the editor opens the preview only on a valid draft, so runtime failures and validation problems never share the popover; the wording is the distinction.

## Verification

- `build/core-tests` `ctest -j8`: 498/498. `build/mac-app` rebuilt.
- `web/ui` node tests 35/35; graph editor typecheck clean, vitest 217/217, build ok.
- Coordinator re-run under the stack lock: `graph-editor:error-shell` 42 s, `refused-save` 43 s, `top-bar` 12 s, `narrow` 24 s, all pass. No browser check asserts runtime preview text.
- Agent's screenshot (faked `EventSource`) of a runtime failure in the popover, its badge and a Whole graph row looked at.

## Open for the owner

- Popover rows show the node id (`rescale`), not its title, beside "this node".
- The reason is the raw server text (e.g. "Shader compile failed: bad uniform"); friendlier per-type reasons would be a later bead.

## Lessons

- none
