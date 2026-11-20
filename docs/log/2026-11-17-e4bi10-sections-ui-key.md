# Graph ui key "#sections" reserved, node ids must not start with '#'

Id: e4bi10-sections-ui-key

`Aurora-e4bi.10`, core only. Pins the reserved graph `ui` key that keeps empty Tuning sections (decision 5a in [[e4bi8-tuning-only-design]]) before the 1.2.0 /api/v1 freeze. Plan: [[graph-editor-cleanup]] Stage 10.

## Decided (owner, 2026-11-17)

- The key is `#sections`, an array of section names. Level-neutral, so each sub-graph definition's `ui` uses the same name (`Aurora-e4bi.11`).
- Node ids accepted any non-empty string, so no key name was clash-proof. The loader now rejects a node id starting with `#` (`node_id_invalid`). Tightening after the freeze would be a breaking change. Rejected: documenting the reservation only.
- No built-in graph, preset, `docs/api` example or `web/` fixture used a `#` id.

## Done

- `GraphLoader.cpp`: `#`-prefixed ids fail with `node_id_invalid`, message names the reservation. Bad-corpus case `node-hash-id`.
- `PipelineTests.cpp`: `ui` with a node position plus `#sections` round-trips through draft PUT, GET and save on the core and v1 routes, valid with no errors. Shared helper `roundTripGraphOnBothRoutes` beside the `Aurora-u8jx.17` case.
- `docs/api/README.md`: non-node `ui` keys are kept, `#` keys are reserved, node ids must not start with `#`. `openapi.yaml` documents neither rule, so it was not touched.
- Key name recorded on `Aurora-e4bi.4`.

## Verification

Sonnet agent, coordinator re-ran: full core ctest 508/508 (35 s, `-j 4`). The agent's own full run had one failure, `ConfigStore round-trips through a real file`, that passed alone and in the coordinator's run. Output was not kept, so it is not filed.

## Lessons

- [[lesson-agent-coordination]]: "bd writes queue behind other sessions and auto-export, so agents run no bd and the coordinator batches bead edits".
