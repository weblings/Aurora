# Nodes and agent UX: planning session, Sequence A filed

Id: nodes-agent-ux-planning

Planning session, no code changed. Turned the node-graph, external-control
and HA workstreams into one sequence plan ([[nodes-agent-ux]]) and filed its
first sequence.

## Done

- `bd import` loaded 390 issues from `.beads/issues.jsonl`.
- **Doc:** `docs/planning/NodesAndAgentUX.md`, sequences added one at a time.
- **Epic `Aurora-ra4o`** (P3, label `node-graph`, agent-proposed): `.1` G0
  spec freeze, `.2` G1 runtime, `.3` G1b corpus and fuzz, `.4` G2a video
  nodes, `.5` G2b audio nodes, `.6` G2c frame nodes and default-graph
  synthesis. G1 depends on G0, everything else on G1.
- **`Aurora-6v36`:** output-neutral brightness floor stage. Depends on
  `Aurora-pngj`, blocks EC 5a (`Aurora-5ipy.7`).
- **Notes added:** pngj (floor design), d7s (control lives in Output
  section), `Aurora-5ipy.5` (scopes read, draft, apply; control added later in `Aurora-5ipy.38`).

## Decisions (owner)

- Graph write access split by action, loopback open for reads and drafts.
- Floor control goes in the Output section, recorded as agent-proposed.

## Findings

- HA has no floor of its own, brightness 0 turns the light off.
- The only existing floor is `audioBrightnessFloor` (default 0.4), audio
  path only. A video or universal floor needs a much lower default.
- The Dashboard has no general-controls section, only Zone Mapping, Tuning
  and Bridge accordions.

## Revised 2026-10-14

- G2c narrowed to its own nodes. New `.7` G2d (built-in graphs plus param
  overlay, parity gate) depends on G2a, G2b and G2c. New `.8` G3 cutover
  (PipelineHost on the Graph, orchestrators removed).
- G2b now depends on `Aurora-7r3`, so parity doesn't lock in the drift bug.
- G0 notes: tick rate, reserved INode hooks, node naming, metadata as
  descriptor extensions, no `graph.json` on disk yet. G1 validator adds
  missing input and one edge per output send.
- pngj: gain after floor recommended. 6v36: built as a core function now,
  wrapped by the Graph later.
