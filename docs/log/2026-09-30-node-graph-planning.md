# Node-graph processing pipeline: exploratory planning pass

No bead yet — this session was doc/research work only, no code changed.
Filed `Aurora-9ca` (1.0.4) as the one concrete side effect: a real,
present-day bug surfaced while reasoning through fail states.

## What's captured

New [`docs/planning/NodeGraphPipeline.md`](../planning/NodeGraphPipeline.md)
(`Id: node-graph-pipeline`), built from a full read of `core/Runtime`,
`core/Processing`, `core/AudioProcessing`, `core/Contracts`, and
`web/ui`'s Dashboard/Tuning/Tooltips code (not guessed from memory):

- **Today's pipelines read as graphs** — `Orchestrator::update()` and
  `AudioOrchestrator::update()` are already chains of small pure
  functions plus explicit state structs; video and audio are mutually
  exclusive today ("video wins"), which a graph would lift.
- **Proposed node/graph shape**: `Contracts` types as ports, `INode`
  with declared ports/params, one `Graph` runtime replacing both
  orchestrators, zones handled at `Frame` level (not one node per
  zone), hot-swap via validate-then-lock-swap keyed by stable node ids.
- **Saved format**: a sketched `graph.json` (nodes/edges/params,
  editor-only `ui` block kept separate from semantics).
- **Node inventory**: ~11 nodes for parity with today's two pipelines
  (table in the doc), a primitives tier that decomposes the compound
  drift/bounce nodes (verified against the real formulas in
  `AudioProcessing.cpp`), and a stretch tier (zone reducers, frequency
  bands, LFOs, spatial chase/gradient — flags that `Frame` has no zone
  position today, a design point to settle before spatial nodes ship).
- **Editor library evaluation**: LiteGraph (dormant upstream, Comfy's
  fork archived into their GPL frontend) vs. React Flow (actively
  maintained, DOM nodes, needs a build step) vs. cables.gl (MIT since
  Aug 2024, but a whole runtime, not an editor library — scoped instead
  as an external WebSocket/OSC consumer-producer, and a Phase 5
  ISF alternative). **Decided**: React Flow — the WebUI's no-build-step
  rule is waived for this editor specifically (owner call: RockyRoad v2
  already runs Vite/TS/npm, and the owner wants to learn React), and
  CMake will run `npm ci && npm run build` before
  `aurora_embed_webroot` rather than committing built output. Consequence
  flagged: Node joins every platform's build prerequisites
  (`Building.md` needs updating when this is built), plus an offline/
  `DESTDIR` packaging gap to solve.
- **UX**: custom effects as siblings of Video/Audio (an Effect dropdown,
  not nested tabs — a mixed graph can use both inputs at once); built-in
  graphs stay read-only (tunable via a param overlay with reset, forces
  "Duplicate → custom" to rewire); Tuning populated from an
  author-curated `controls` list per graph, not every param; tooltips
  extend the existing `ControlDescriptor`/`DescriptorRegistry` system
  with a per-node-param namespace and a longer `details` field for the
  editor's inspector, with graph-author overrides taking precedence
  over the node type's own description.
- **Live preview and fail states**: reuses `DevLightTap`/`DevFrameDump`'s
  payload shapes over a new real (non-dev) SSE endpoint, not the dev
  tools themselves; three preview surfaces (per-node thumbnails, a 2D
  zone-map corner preview — "light viz without the 3D models," as
  discussed live — and a lights-driving test mode); draft/live graph
  split with server-side auto-revert (timeout/heartbeat) so a closed
  tab can't strand broken lights; magenta-checker error rendering in
  previews only, never flashed onto real lights by default.
- **Stretch: object detection and motion** — ties into the existing
  [[open-formats-research]] YOLO/Frigate-pattern design (bounding boxes
  reuse `UVs`, persistent track ids); motion vectors are new scope.
  Flags two things the core design should allow now: async
  (non-blocking) nodes, and per-node capture resolution instead of one
  global `subsampleWidth`. Confirmed OpenCV's `dnn`/`video`/`optflow`
  modules are already present alongside `imgproc` on this machine and
  in vcpkg's default `opencv4` build — likely no new dependency for the
  motion-only slice; flagged Ultralytics YOLO's AGPL licensing as a
  real constraint given Aurora serves a WebUI (network clause), needing
  a permissive alternative (YOLOX/RT-DETR) verified before choosing.

## Bug found along the way: `Aurora-9ca`

Working through the preview fail-state section's "sanitize before the
uint8_t cast" note, traced a NaN/Inf path that's reachable **today**,
with no graph involved: `PUT /api/config {"audioCentroidRangeHz": 0}`
hits an unclamped `Config` setter (`setAudioCentroidRangeHz` has no
`std::clamp`, unlike `setTransitionSmoothing` a few lines above it in
`Config.cpp`), reaches an unguarded divide in `updateDrift`, and the
resulting NaN survives `wrapDegrees`'s `fmod` into `Color::fromHSV` —
where every `hPrime < N` branch compares false against NaN, falling to
the last `else`, and `static_cast<ChannelDepth>(std::round(NaN))` is
UB right there in `fromHSV`'s own return, before `Smoother` ever sees
it (corrected from an initial guess that `Smoother` was the risk).
Filed as `Aurora-9ca` (P2, `1.0.4`): clamp the setter, add a
non-finite guard at the `fromHSV` cast site as defense in depth, test
both.

## State

Planning-only, paused here. `docs/planning/NodeGraphPipeline.md`'s own
"Open questions" section is the resume pointer — no bead breakdown
exists yet for the graph work itself; that's the natural next step
before any implementation starts.
