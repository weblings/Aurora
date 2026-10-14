# G2c Tier 1 frame nodes (Aurora-ra4o.6)

Id: ra4o6-g2c-frame-nodes

Closed 2026-10-14. Three nodes wrapping the existing frame tail unchanged
(`composeAudioFrame`, `Smoother::smooth`, `IOutput::send`). Depends on
Aurora-ra4o.2 and Aurora-ra4o.9, both closed.

## Done

- New ungated `core/Runtime/Graph/FrameNodes.{hpp,cpp}` +
  `registerFrameNodes()`: `frame.smooth` (owns a `Smoother`, keyed by its
  `output` param, `smoothing` 0..0.97 default 0) and `output.send` (sink,
  `IGraphHost::output(name)`, fails on unknown output or no host).
- `frame.broadcast` stays in the gated `AudioNodes.cpp` (registered by
  `registerAudioNodes`), since `composeAudioFrame` compiles only in audio
  builds. Reads `IGraphHost::zoneMap(output)` every tick.
- Decisions: Absent or error frames never reach `output.send`, so a
  skipped tick sends nothing (today's early returns). Aurora-6v36 (floor
  stage) has not landed, so no floor wrapping here.
- Tests: new `core/tests/FrameNodesTests.cpp` in `AuroraRuntimeTests`
  (6 cases: smooth parity tick for tick, send routing, Absent, unknown
  output, no host) plus 1 broadcast case in `AuroraAudioOrchestratorTests`.
  Full core suite 239/239 (GCC build).
- MSVC fix: `Graph::Graph` in the node tests was ambiguous under
  `using namespace Aurora::Runtime` + `Aurora::Runtime::Graph`, so the
  Visual Studio build failed. Tests now spell `Aurora::Runtime::Graph::Graph`.

- Lessons: 3 (MSVC `Graph::Graph` ambiguity in language-cpp, WSL-configured
  `build/` tree in build-toolchain, sink-node error observability in
  architecture-process).

## Carried forward

- G2d (Aurora-ra4o.7): built-in Video/Audio graphs + parity gate.
