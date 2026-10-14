# G1b bad-graph corpus + loader fuzz (Aurora-ra4o.3)

Id: ra4o3-g1b-bad-graph-corpus

Closed 2026-10-14. Test-only change to the G1 graph runtime from
Aurora-ra4o.2; no loader or evaluator code touched. Unblocks G2a-c
per-node tests with a reusable fixture pattern.

## Done

- Claimed, implemented, and closed `Aurora-ra4o.3`.
- **New:** `core/tests/GraphBadCorpusTests.cpp` in `AuroraRuntimeTests` —
  41 bad-graph fixtures (one per loader rejection class: bad JSON,
  version/tickHz, node identity, unknown/mistyped params, malformed
  edges, ghost nodes/ports, type mismatch, double-fed input, double
  sink, missing required input, cycles, bad controls, throwing
  factory, instance/registry port disagreement), each asserting the
  error names the culprit plus the expectation and is short printable
  text; plus a fixed-seed (`20261014`) property test — 2000 random
  graphs through both `loadGraph` and `loadGraphFromString` (never
  throw, agree, tick clean on odd dts) and 500 byte-mutated strings.
- **Docs:** `[[node-graph-pipeline]]` `Status:` refreshed (G1b landed,
  G2/G3 pending). Kept live, not archived: still feeds unshipped work.

## Decisions

- Corpus lives inline in the test (table of doc + fragments), matching
  `GraphTests.cpp`, not in `golden/` — golden is parity frames, and
  inline keeps fixture next to its readability assertion.
- Fuzz seed is a hard-coded constant, overridable by nothing: "fixed in
  CI" means deterministic by construction, not by env plumbing.
- Per-case `LoadOptions` in the corpus struct instead of one shared
  set (see lesson below).

## Findings

- First run 28/29: the unregistered-output fixture passed `knownOutputs
  = {"hue"}` while binding `"hue"` — valid input, wrong fixture. The
  loader checks output bindings before edges/sinks, so the two-sinks
  fixture needs `"hue"` known and the unregistered one needs it absent.
  Lesson filed (bad-graph fixture vs earlier loader check).
- Fuzz confirmed the loader is throw-safe on both entry points
  (`loadGraphFromString` catches parse errors; `loadGraph` guards every
  `.get`), so no production fix came out of G1b — the corpus is the
  deliverable.
- `ctest -R "Graph"`: 29/29 green; full `AuroraRuntimeTests` binary:
  60 cases / 10166 assertions green.
