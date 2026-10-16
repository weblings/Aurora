# Sequence B planning: decisions recorded, epic filed

Id: sequence-b-planning

Planning session, no code changed. Research settled the open decisions after
Sequence A closed, and Sequence B of [[nodes-agent-ux]] was filed.

## Done

- **Epic `Aurora-id8j`** (P3, label `node-graph`, agent-proposed), children
  `.1` B0 Float/Trigger ports, `.2` B1 read routes, `.3` to `.8` B2a to B2f
  primitive families, `.9` B3 decomposition parity, `.10` B4 Tuning renders
  `controls`. B2 depends on B0, B1 on `Aurora-5ipy.4` (EC 3), B3 on
  B2a/b/c/f, B4 on B1.
- Closed `Aurora-ra4o` (Sequence A) and `Aurora-pngj` (floor decision).
- `Aurora-6v36` rewritten for the three floor policies, with tests per policy.
- Docs: `NodeGraphPipeline.md`, `NodesAndAgentUX.md`,
  `HomeAssistantOutput.md`, `ExternalControl.md`.

## Decisions (owner approved agent recommendations)

- **Spatial effects** are Image generators sampled by `zones.sample`. `Frame`
  gets no position and no host geometry service. Room-space effects are a
  later Hue-only question (Hue `channels[].position` is not parsed yet).
- **Tier 2 additions:** gradient/palette value, blend modes on mixing,
  frequency bands and a free-running LFO promoted from Stretch.
- **Time model:** new smoothing is time-based (`1 - exp(-dt/τ)`), `frame.smooth`
  stays per-tick for parity, `dt` stays nominal.
- **Simple mode stays default.** Tuning renders the active graph's `controls`,
  the editor is an advanced screen over the same `graph.json`.
- **External-control order:** EC 3 before B's routes, EC 2a beside B,
  EC 4a before C.
- **Brightness floor:** one stage after gain, per-output policy off (default),
  colored hold floor, or switch off at black with a hold time.

## Findings

- Neither `Frame` nor ZoneMap carries room position. ZoneMap UVs are screen
  rects, which is what `zones.sample` already uses.
- The earlier claim that B and the external lane were independent was wrong:
  every route binds `0.0.0.0` with no Host check, so EC 3 comes first.
- Prior art: WLED, xLights, TouchDesigner and Resolume render to a grid and
  sample at fixture positions. Ollama CVE-2024-28224 and 2026 MCP HTTP
  advisories were all fixed by a Host/Origin allowlist.
- Hyperion.ng setting names (`brightnessMin`, `brightnessSwitchOffOnMinimum`)
  come from one bug report, not its schema docs. LedFx and WLED effect-library
  claims come from file and effect names, not code reads.

## Carried forward

- Whether the HA output is a go (`Aurora-4zr`) is still open.
- Floor value and hold time wait on real-bulb measurement (`Aurora-4zr.9`).
- First work: B0 (`Aurora-id8j.1`) and EC 3 (`Aurora-5ipy.4`).
