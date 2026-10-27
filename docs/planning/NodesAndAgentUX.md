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
  Scopes (read, draft, control, apply) belong in EC 4a from the start. Owner approved
  this split on 2026-10-13, and on 2026-10-16 kept LAN reads paired after
  5ipy.5 had left them open. Detail lives in [[external-control]].
- **Agent metadata ships in the node registry.** Each node carries purpose,
  use_when, example, units and cost, served by `GET /api/nodes`. One source for
  editor tooltips and agent prompts. Detail lives in [[node-graph-pipeline]].
- **Brightness floor** (decided 2026-10-15, Aurora-pngj): one stage after
  gain, per-output policy off (default), colored hold floor, or switch off
  at black after a hold time. Control lands in the Output section. Detail
  in [[home-assistant-output]].
- **Simple mode stays the default** (decided 2026-10-15). Tuning renders the
  active graph's `controls`; the editor is an advanced screen over the same
  `graph.json`. Detail in [[node-graph-pipeline]].
- **External-control order** (decided 2026-10-15): EC 3 Host allowlist
  before Sequence B's read routes, EC 2a beside B, EC 4a before C, EC 5
  after C's write routes (2026-10-20). D does not wait on EC 5 and owns EC
  6a's adapter skeleton (2026-10-21). Detail in [[external-control]].
- **Not decided here:** whether HA output is a go (Aurora-4zr).

## Sequence A: foundations

Status: done 2026-10-15 (epic closed). Filed 2026-10-13, revised 2026-10-14
(G2d and G3 added, G2c narrowed), G4a-d review fixes added 2026-10-15.
Epic `Aurora-ra4o` (G0 to G3), plus the external and floor beads below.

- **Goal:** a Graph runtime that reproduces today's pipelines byte-for-byte,
  the app running on it, and the safety prerequisites for exposing it. No
  user-visible change.
- **Beads:**
  - Node: `Aurora-ra4o.1` G0 spec freeze, `.2` G1 runtime, `.3` G1b corpus,
    `.4` G2a video nodes, `.5` G2b audio nodes, `.6` G2c frame nodes,
    `.7` G2d built-in graphs and parity gate, `.8` G3 cutover.
  - Prerequisite: `Aurora-7r3` (drift bug) before G2b, so parity doesn't
    lock the bug into the audio nodes.
  - External: `Aurora-5ipy.4` EC 3, `.1` EC 0, `.2`/`.3` EC 2a/2b, `.8` EC 5b,
    `.5` EC 4a (with scopes), `.7` EC 5a.
  - Decision and floor: `Aurora-pngj`, `Aurora-6v36`, `Aurora-d7s`.
- **Gate:** the golden parity harness (Aurora-tft) passes through the Graph
  for both built-in graphs (G2d), and the app runs on the Graph with the
  orchestrators removed (G3).
- **Parallel:** node lane and external lane are independent. G2a, G2b and G2c
  are independent once G1 lands. G2d joins them. Floor stage waits only on
  pngj, which also settles its order relative to EC 5a gain.
- **OS:** logic is platform-neutral and runs in core tests on all three CI
  platforms. Audio nodes need a per-OS capture recheck. EC 3 needs each OS's
  hostnames, including the mDNS names. EC 4a stores token hashes beside
  config, not in the OS secret store.
- **Tests:** golden parity, bad-graph corpus plus loader fuzz, fake clock,
  middleware negative tests (rebinding, 401, revoked token).

## Sequence B: read surface and Tier 2 primitives

Status: filed 2026-10-15. Epic `Aurora-id8j`. Decisions it rests on, all
2026-10-15 in [[node-graph-pipeline]]: spatial effects are Image generators
sampled by `zones.sample` (no `Frame` position), Tier 2 smoothing is
time-based, Tier 2 adds gradients, blend modes, bands and LFO.

- **Goal:** the graph is readable from outside, the primitive set can
  express today's compounds, and Tuning is driven by the graph. No editor yet.
- **Beads:** `Aurora-id8j.1` B0 Float/Trigger ports and split audio
  features, `.2` B1 read routes, `.3` B2a scalar math, `.4` B2b time/state
  and LFO, `.5` B2c color/palette/gradient, `.6` B2d frame and image ops
  with blend modes, `.7` B2e spatial Image generators, `.8` B2f frequency
  bands, `.9` B3 decomposition parity, `.10` B4 Tuning renders `controls`.
- **Prerequisite:** `Aurora-5ipy.4` (EC 3) before B1. Pairing UI
  (`Aurora-5ipy.6`) stays in the external lane, needed by C, not B.
- **Gate:** B3, the decomposed drift and bounce graphs match the compound
  nodes within epsilon on the existing parity fixtures, and B4 shows
  today's Tuning controls from the built-in graphs' `controls`.
- **Parallel:** B0 first. Then B2a to B2f are independent of each other.
  B1 needs only EC 3. B3 joins B2a, B2b, B2c and B2f. B4 follows B1.
- **OS:** all nodes platform-neutral, core tests on three CI platforms. B2f
  reads the existing audio buffer, no capture change. B4 is WebUI only.
- **Tests:** per-node Graph cases, descriptor completeness, fake-clock
  settle-time checks at 30/60/240 Hz for B2b, bad-graph corpus extended for
  the new port types, generator render cost logged for B2e.

## Sequence C: safe writes

Status: filed 2026-10-20. Epic `Aurora-52oz`. Decisions in
[[sequence-c-planning]]: custom effects in `effects/` with `activeEffectId`,
concrete output names (D instantiates presets), a fallback warning when a
custom graph cannot load, per-session drafts, zone-color preview in C.

- **Goal:** a client can draft, check, preview, try on the lights and apply
  a custom graph without risking stranded lights. No editor yet.
- **Beads:** `Aurora-52oz.1` C0 effect storage and fallback warning, `.2` C1
  inputs from the graph's source nodes, `.3` C2 drafts and validate, `.4` C3
  apply, `.5` C4 test on lights with auto-revert, `.6` C5 draft preview,
  `.7` C6 Tuning on custom effects, `.8` C7 gate.
- **Prerequisite:** EC 4a/4b/4c (done). EC 5 follows C's write routes.
- **Gate:** C7, a scripted client on the fake-Hue stack runs the whole flow
  on three OSes, including revert on a dropped heartbeat and the fallback
  warning.
- **Parallel:** C0 and C1 first. C2 follows C0. C3 and C5 join C2 and C1.
  C4 follows C3. C6 needs only C0.
- **OS:** C1 needs a per-OS dual-capture recheck. Everything else is
  platform-neutral core and route tests.
- **Tests:** scope negatives per route, bad-graph corpus through validate,
  fake-clock revert paths, preview never reaching an output, tick budget
  with a preview running.

## Sequence D: MCP for graphs

Status: filed 2026-10-21. Epic `Aurora-4xqt`. Decisions in
[[sequence-d-planning]]: a working MCP setup for graphs is the razor, so D
does not wait on EC 5 or `Aurora-m2c`. The adapter is hand-rolled C++ over
stdio. C's accepted gaps close first (D0). A Dashboard toggle for MCP graphs
stays hidden until the first one.

- **Goal:** a local MCP client (Claude Code, Claude Desktop, VS Code) starts
  Aurora's adapter and lists nodes and presets, drafts and validates,
  previews, tries on the lights, applies and reverts a custom graph, on three
  OSes, with no token on loopback.
- **Beads:**
  - Gaps: `Aurora-4xqt.1` D0a outputs survive an input-only rebuild
    (preview and test accept graphs needing other inputs), `.2` D0b MCP
    effect toggle, `.3` D0c actionable validate errors, `.4` D0d confirm
    window for a chat loop, `.5` D0e preview summary route, `.6` D0f C
    follow-ups.
  - Adapter: `.7` D1 skeleton with `aurora_status`, `.8` D2 node and preset
    read tools, `.9` D3 draft tools, `.10` D4 try and apply tools, `.11` D5
    agent instructions and client setup, `.12` D6 gate.
- **Prerequisite:** none outside D. EC 6a (`Aurora-5ipy.10`) narrows to
  control tools on D1's binary.
- **Gate:** D6, a scripted MCP client spawns the adapter on the fake-Hue
  stack. It fixes a broken draft from the error options, previews, tries a
  both-input graph from a video-live state, applies, survives a restart and
  reverts, and the lights revert after a killed client. Three OSes.
- **Parallel:** D0a to D0e and D1 are independent. D2 follows D1. D3 joins
  D1, D0c and D0e. D4 joins D3, D0a, D0b and D0d. D5 follows D2 and D4. D6
  joins D2, D4, D5 and D0f.
- **OS:** D0a needs a per-OS capture recheck, because adding video can raise
  the Wayland portal or the macOS screen permission. D1 is built, bundled
  and signed per OS. Everything else is platform-neutral core and route tests.
- **Tests:** fake-clock confirm and revert paths, bad-graph corpus asserting
  error codes and options, preview summary on static and LFO graphs, stdio
  framing and version negotiation, MCP Inspector smoke, and a manual eval of
  about 10 prompts in D5. A scored eval corpus is after D.

## Later sequences (stubs)

Each gets a full section when it starts.

- **E: editor.** Status: not started. React Flow editor, after or beside D.
  Takes over the Effect picker (`Aurora-kep2`) and source-less graphs
  (`Aurora-t9iq`) from the D0b toggle.
