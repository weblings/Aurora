# Shell: a failed effect or reload reads in 7a's words on the Dashboard and in the editor

Id: u8jx15-shell-effect-copy

`Aurora-u8jx.15` (Stage 7d, epic `Aurora-u8jx`). See [[graph-editor-cleanup]] Stage 7. Uses the table from [[u8jx1-problem-copy]].

## What changed

- Core: `HostError` carries an optional `code` and a `detail` map of strings. `CodedBuildError` (base of `EffectBuildError`) carries them out of `Pipeline::build`, and the startup, reload, failed-switch and resume paths copy them onto the held error. `GraphRunner` keeps the first load issue (`customIssue()`) so a graph that fails to load reports the GraphLoader's code and node. The server `message` is unchanged for agents and MCP.
- `/api/state` (and so `/api/v1/state`, the events stream and the health topic, which share `stateToJson`) adds `code` and `detail` to an error only when core has them. `docs/api/openapi.yaml` and the generated JSON list both on `HostError`.
- Codes: `input_not_configured` (`inputKind`), `input_unavailable` (`inputKind`, `inputName`), `no_outputs`, `effect_unreadable`, and the GraphLoader issue code (`node` in detail). An effect-source error also carries `effectTitle`, so the shell can write "Couldn't start Sunset".
- `web/ui/problemCopy.js`: new `HOST_COPY` and `hostCopy()`. Entries are the clause after the row's prefix. Graph-load codes other than `node_construct_failed` share one clause, because the graph table's own sentences say "this node" and a shell row has no node beside it.
- `web/ui/shellRows.js` `errorSentence` uses `hostCopy` and keeps today's text for a missing, unknown or inherited code (old servers). Both pages go through it, so `shell.js` and `ErrorShell.tsx` needed no edit beyond the `HostError` type. Retry, the dismiss X and the Mac permission rows are untouched.

## Verification

- `build/core-tests` `ctest -j8`: 506/506. `build/windows-app` rebuilt.
- `web/ui` node tests all pass (18 files), graph editor typecheck clean, vitest 236/236.
- Browser checks: `graph-editor:failed-save` 24 s, `graph-editor:error-shell` 53 s, `dashboard-shell` 47 s, all pass.

## Not covered

- An input that opens and then throws (`input->init()`), the "no audio support" message and a test-on-lights graph failure stay uncoded and read as before. Wrapping `init()` would change the exception type the Mac `describeBuildError` checks.
- `node_construct_failed` has no end-to-end core test (the graph registry cannot be injected into `GraphRunner`). `output_unregistered` stands in for the pass-through, and the loader itself is tested in `GraphBadCorpusTests`.

## Open for the owner

- The node is named by its id (`"grad"`), not its type title, because a load issue only has the id.

## Lessons

- none
