# B5: one registerAllNodes for runner, /api/nodes and tests (Aurora-id8j.11)

Id: id8j11-b5-register-all-nodes

Closed 2026-10-16. Sequence B of [[nodes-agent-ux]]. The B2a lesson: node
families were registered in four places, so a missed site made `/api/nodes`
advertise nodes the runner could not load, or hide ones it could.

## Done

- `registerAllNodes(registry, includeAudio)` in `Graph/AllNodes.{hpp,cpp}`.
  Registers video, frame, math, time, color, blend and spatial nodes, plus
  audio when `includeAudio` and `AURORA_RUNTIME_AUDIO_AVAILABLE`.
- Both `GraphRunner` constructors, `/api/nodes` and the `/api/nodes` test in
  `PipelineTests` call it. No other per-family calls remain in production code.
- Test: `includeAudio=false` omits `audio.capture` and keeps `video.capture`.
  The existing `/api/nodes` test now compares against `registerAllNodes`.
- Core suite 343/343 (MSVC).

## Carried forward

- Each runner now also registers the other family's nodes. A video node in the
  audio runner (or the reverse) loads, then fails at runtime for lack of an
  input from the host.
- Unit tests for single families (`AudioParityTests`, `*NodesTests`) still
  register only what they need, on purpose.
