# Sub-graph readiness: Tuning is one graph level's exposed params

Id: e4bi11-subgraph-readiness

`Aurora-e4bi.11`. Settles the points of the Tuning-as-exposed-params proposal that touch the /api/v1 format freezing in 1.2.0. Sub-graphs ship in 1.2.1 (`Aurora-g5mz`). Plan: [[graph-editor-cleanup]] Stage 10, "One level at a time".

## Decided (owner, 2026-11-17)

- A control points at a node in its own graph, so `{node, param}` stays flat. A sub-graph definition carries its own `controls` array of the same entry shape. No new type.
- Readers ignore extra control keys, so later fields (range or default overrides) are a minor bump.
- The `#sections` ui key is level-neutral ([[e4bi10-sections-ui-key]]).
- Tuning's Tree in `Aurora-e4bi.3` and `.4` takes a controls array and graph name as input, not the top-level doc.

## Done

- `PipelineTests.cpp`: a control entry with an unknown key round-trips through draft PUT, GET and save on the core and v1 routes, valid with no errors.
- Plan Stage 10: "One level at a time" subsection.
- Bead notes: `Aurora-g5mz` (the one-level rule, `control_param_unknown` must resolve a sub-graph node's params from its interface, and the 1.2.1 opens: ports, orphaned controls one level up, shared interface edits, sections on a node, overrides). `Aurora-e4bi.3` and `.4` (Tree input).

## Verification

Sonnet agent, coordinator re-ran: full core ctest 508/508.

- Lessons: none
