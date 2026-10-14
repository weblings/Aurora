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
  section), `Aurora-5ipy.5` (scopes read, draft, apply).

## Decisions (owner)

- Graph write access split by action, loopback open for reads and drafts.
- Floor control goes in the Output section, recorded as agent-proposed.

## Findings

- HA has no floor of its own, brightness 0 turns the light off.
- The only existing floor is `audioBrightnessFloor` (default 0.4), audio
  path only. A video or universal floor needs a much lower default.
- The Dashboard has no general-controls section, only Zone Mapping, Tuning
  and Bridge accordions.
