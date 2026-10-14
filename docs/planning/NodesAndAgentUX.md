# Nodes and agent UX: sequences

Id: nodes-agent-ux

Status: exploratory (2026-10-13), agent-proposed, not committed. One section
per sequence, added when that sequence is about to start. Order lives in bead
dependencies (`bd show Aurora-ra4o`), not here. This doc holds each
sequence's goal, gate, parallelism, OS notes and test approach.

Goal: users tweak an agent-built graph instead of starting from a blank
canvas. That needs the graph runtime ([[node-graph-pipeline]]), a safe write
path ([[external-control]]) and an adapter an assistant can call (EC 6a).

## Standing decisions (agent-proposed)

- **Write access split by action.** Reads and graph draft/validate are open on
  loopback and paired on LAN. Apply and test-on-lights need the WebUI session
  or an apply-scoped token. Host allowlist and Origin check are mandatory.
  Scopes (read, draft, apply) belong in EC 4a from the start. Owner approved
  this split on 2026-10-13. Detail lives in [[external-control]].
- **Agent metadata ships in the node registry.** Each node carries purpose,
  use_when, example, units and cost, served by `GET /api/nodes`. One source for
  editor tooltips and agent prompts. Detail lives in [[node-graph-pipeline]].
- **Brightness floor** is per output, colored, holds the last hue at exact
  black, default off. Control lands in the Output section. Decision bead is
  Aurora-pngj, see [[home-assistant-output]].
- **Not decided here:** whether HA output is a go (Aurora-4zr).

## Sequence A: foundations

Status: filed 2026-10-13. Epic `Aurora-ra4o` (G0 to G2c), plus the external
and floor beads below.

- **Goal:** a Graph runtime that reproduces today's pipelines byte-for-byte,
  and the safety prerequisites for exposing it. No user-visible change.
- **Beads:**
  - Node: `Aurora-ra4o.1` G0 spec freeze, `.2` G1 runtime, `.3` G1b corpus,
    `.4` G2a video nodes, `.5` G2b audio nodes, `.6` G2c frame nodes and
    default-graph synthesis.
  - External: `Aurora-5ipy.4` EC 3, `.1` EC 0, `.2`/`.3` EC 2a/2b, `.8` EC 5b,
    `.5` EC 4a (with scopes), `.7` EC 5a.
  - Decision and floor: `Aurora-pngj`, `Aurora-6v36`, `Aurora-d7s`.
- **Gate:** the golden parity harness (Aurora-tft) passes through the Graph
  for both default graphs.
- **Parallel:** node lane and external lane are independent. G2a, G2b and G2c
  are independent once G1 lands. Floor stage waits only on pngj.
- **OS:** logic is platform-neutral and runs in core tests on all three CI
  platforms. Audio nodes need a per-OS capture recheck. EC 3 needs each OS's
  hostnames, including the mDNS names. EC 4a uses the OS secret-store
  interface, with a fallback where libsecret is absent.
- **Tests:** golden parity, bad-graph corpus plus loader fuzz, fake clock,
  middleware negative tests (rebinding, 401, revoked token).

## Later sequences (stubs)

Each gets a full section when it starts.

- **B: read surface and primitives.** Status: not started. Read routes
  (`/api/nodes`, `GET /api/graph`), Tier 2 primitives in four parallel
  families, pairing UI.
- **C: safe writes.** Status: not started. Draft/validate routes, apply route
  with scopes, draft vs. live with auto-revert, public API contract.
- **D: agent path.** Status: not started. Annotated preset graphs, MCP tools
  (`list_nodes`, `get_graph`, `validate_graph`, `put_draft`, `preview`,
  `apply`), agent skill, and an eval corpus of plain-language prompts scored
  on first-try validity and simple rendered properties.
- **E: editor.** Status: not started. React Flow editor, in parallel with D.
