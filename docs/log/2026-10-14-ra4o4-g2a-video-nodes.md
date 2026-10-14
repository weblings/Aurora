# G2a Tier 1 video nodes (Aurora-ra4o.4)

Id: ra4o4-g2a-video-nodes

Closed 2026-10-14. First G2 bead: four coarse nodes wrapping the existing
video path unchanged (`Orchestrator::update` grab + `_prepareSource` +
`composeFrame`). Independent of G2b/G2c.

## Done

- New `core/Runtime/Graph/VideoNodes.{hpp,cpp}` + `registerVideoNodes()`:
  `video.capture` (grab every tick, Absent when unhealthy/empty, same
  `ImagePtr` while `frameSerial()` unchanged, serial 0 always rebuilds),
  `image.rescale` (`width` Float 0 = passthrough + `interpolation` enum,
  identity cache invalidated on any param change), `image.dropAlpha`
  (zero-copy passthrough when already opaque), `zones.sample` (`output`
  binding param, live `zoneMap()` read every tick).
- Decisions: no DevFrameDump tap in G2a nodes (stays on the legacy path;
  G2d wires the graph equivalent); integer width travels as Float and is
  rounded at evaluate (`ParamKind` has no int); `rescale()`'s empty-output
  upscale guard re-implemented as input passthrough per node.
- Tests: new `core/tests/VideoNodesTests.cpp` (6 cases, per-node through
  the Graph incl. a 4-node chain). Full core suite 224/224, runtime binary
  72 cases / 10499 assertions.

## Carried forward (bead notes)

- G2b stays blocked on Aurora-7r3 (fix + regenerate fixtures first, so
  `audio.drift`/`audio.bounce` don't lock in the bug); G2c is ready.
- G2d: built-in Video/Audio graphs + parity gate through the Graph.
- No `web-processing/` mirror change: wrapped C++ math untouched.
