# G2d built-in Video and Audio graphs, parity gate (Aurora-ra4o.7)

Id: ra4o7-g2d-builtin-graphs

Closed 2026-10-14. The two built-in graphs exist in the binary and the
golden parity scenarios now run through them. Depends on Aurora-ra4o.4,
.5, .6 (all closed).

## Done

- New `core/Runtime/Graph/BuiltInGraphs.{hpp,cpp}` (ungated):
  `builtInVideoGraph` / `builtInAudioGraph` build the graph.json doc in
  code, `loadBuiltIn{Video,Audio}Graph` load it with `knownOutputs`.
  - Video: `cap -> rescale -> opaque`, then per output `zones_<o> ->
    ease_<o> -> send_<o>`. Audio (`tickHz` 60): `cap -> feat -> drift/beat`,
    then per output `all_<o> -> send_<o>`.
  - Per-output ids come from `perOutputNodeId` (non-alphanumerics become
    `_`, since `.` breaks edge syntax). Output order is declaration order,
    so sends keep today's order.
- ConfigData overlay (`videoOverlayFromConfig`, `audioOverlayFromConfig`):
  nodeId -> param -> value, applied while building the doc. Covers
  `subsampleWidth`, `interpolation`, `transitionSmoothing` and every
  `audio*` field. Config's negative `audioFixedAnchorHue` becomes `null`.
  Overlay keys the graph lacks are ignored.
- Decision (open question from G1c): no `Graph::setParam`. A Tuning edit is
  rebuild doc, `loadGraph`, `adoptStateFrom` (state follows node id + type,
  params come from the new graph). Outputs are host-owned, so no
  reconnect. Revisit only if the per-edit load cost shows up.
- Parity gate: `VideoParityTests` and `AudioParityTests` run each scenario
  through the legacy path and the built-in graph against the same fixture
  (new `GraphParityHost.hpp`). Scripted-feature scenarios swap
  `audio.capture` + `audio.features` for a test-only node and keep the
  built-in wiring. Under `AURORA_UPDATE_GOLDEN` only the legacy path
  writes, so fixtures stay derived from it.
- Tests: 6 cases in new `BuiltInGraphsTests.cpp`. Mutating the smoothing
  overlay fails 18 assertions in the Video gate, so the graph path does
  gate. Windows MSVC Debug: full suite 245/245 incl. both Parity exes.

- Lessons: 3 (Git Bash mangling MSBuild `/v:m` in build-toolchain,
  class-nested `IVideoInput::Resolution` in language-cpp, dual-path parity
  gate needing fresh inputs and a mutation check in debugging-method).

## Carried forward

- Mac and Linux runs of the parity gate (only Windows was run here).
- DevFrameDump tap for the graph path (post-dropAlpha image) lands with
  G3, when a host actually runs the Video graph. `Orchestrator::update`
  still publishes the tap until then.
- Agent metadata (`useWhen`/`example`/`cost`) still not exported by
  `NodeRegistry::toDescriptors()`; needed before the agent-authoring path.
- G3 (Aurora-ra4o.8): cutover, orchestrators removed. Parity tests then
  drop the legacy path and keep the graph one.
