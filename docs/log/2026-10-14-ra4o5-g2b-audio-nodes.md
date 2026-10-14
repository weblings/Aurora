# G2b Tier 1 audio nodes (Aurora-ra4o.5)

Id: ra4o5-g2b-audio-nodes

Closed 2026-10-14. Four coarse nodes wrapping the existing audio path
unchanged (`AudioOrchestrator::update` read + `AudioFeatureExtractor` +
`updateDrift`/`updateBounce`, post-7r3 behavior). Depends on Aurora-7r3,
Aurora-ra4o.2, Aurora-ra4o.9 — all closed.

## Done

- New `core/Runtime/Graph/AudioNodes.{hpp,cpp}` + `registerAudioNodes()`:
  `audio.capture` (readNextBuffer every tick via `IGraphHost::audioInput`,
  Absent on empty buffer), `audio.features` (aubio extractor built lazily
  from the first buffer's sampleRate, same as the orchestrator),
  `audio.drift` (owns `DriftState`, outputs the live anchor as `Angle`),
  `audio.bounce` (owns `BounceState`, required `anchor` Angle input,
  outputs `Color`; re-targets anchor + offset every tick).
- Decisions: both drift and bounce expose `fixedAnchorHue` (OptionalFloat,
  null = unset) and reset their own state when it changes to a different
  hue, mirroring `AudioOrchestrator::setSettings` resetting both states;
  clearing it keeps the running anchor. Node param defaults follow the live
  Config defaults (e.g. bounceSmoothTime 0.285, drift rate 10), not the
  `AudioEffectSettings` struct initializers, which differ — 1 lesson.
  No DevFrameDump tap (same reasoning as G2a); no per-OS capture change,
  so per-OS re-verification is the existing input coverage.
- Tests: new `core/tests/AudioNodesTests.cpp` (8 cases, per-node through
  the Graph: first-tick parity with the orchestrator's send, Absent freeze
  across an empty tick, re-seed on hue change via swap + adoptStateFrom,
  keep-anchor on clear). Tests live in the gated
  `AuroraAudioOrchestratorTests` exe, not `AuroraRuntimeTests`, so
  video-only builds stay green — 1 lesson. The 4-sample fake buffers stay
  under one aubio hop, keeping features exact and deterministic — 1 lesson.
  Full core suite 232/232.

## Carried forward (bead notes)

- G2c (Aurora-ra4o.6): frame.broadcast, frame.smooth, output.send —
  the sinks the audio/video chains still need.
- G2d (Aurora-ra4o.7): built-in Video/Audio graphs + parity gate through
  the Graph.
- No `web-processing/` mirror change: wrapped C++ math untouched.
