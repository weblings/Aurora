# G1 graph runtime core lands (Aurora-ra4o.2)

Id: ra4o2-g1-graph-core

Closed 2026-10-14. Pure C++ under `core/Runtime/Graph/`, no I/O; unblocks
G2a/G2b/G2c (Aurora-ra4o.4/.5/.6).

## Done

- Claimed, implemented, and closed `Aurora-ra4o.2`.
- **New:** `GraphTypes` (5 Sequence-A port types, 4 param kinds),
  `GraphValue` (Absent + GraphError with originating node id; Image by
  reference, rest by value), `INode` (evaluate + self-heal contract +
  reserved async/sampling-width hooks), `NodeRegistry` (factories +
  agent metadata, exports `node.<type>` descriptors), `Graph` (topo
  evaluator, `adoptStateFrom` by stable id), `GraphLoader`
  (nlohmann_json, every G0 rejection class).
- **Tests:** `core/tests/GraphTests.cpp`, 27 cases / 666 assertions, all
  green; full `ctest --test-dir build/core-test` 210/210.
- **Doc:** `[[node-graph-pipeline]]` header `Status:` refreshed (G1
  landed, G2/G3 pending). Kept live, not archived: it still feeds
  unshipped work.

## Decisions

- Optional inputs evaluate with `Absent` in ctx (the node decides);
  only required-input `Absent` and any error skip `evaluate`.
- Sink-collision rule (Aurora-o13) generalized: any type declaring
  `sinkBindingParam` joins the one-sender-per-output check, so the
  test `test.send` exercises the real rule.
- Params flow per-tick via `EvalContext`, never baked into the node —
  what makes adopted (state-carrying) instances run new params.
- Loader assembly as documented-public `Graph` methods, not a friend
  class (friend-across-headers needs prior declarations; not worth it).

## Findings

- First run 25/27: error-propagation ids came back empty. Root cause was
  a moved-from read — `asError()` on the local *before* moving it into
  `ctx.inputs`, leaving the stored pointer on moved-from state. Fix:
  check the stored copy. Lesson filed (moved-from variant read).
- Test-only registry pattern (`test.*` types + shared probes captured
  in factories) is what G2a-c per-node tests should copy.
- `bd` mutating commands take 20s+ here (auto-export of 401 issues);
  run them with a long yield, not `timeout` (sandbox forbids it).
