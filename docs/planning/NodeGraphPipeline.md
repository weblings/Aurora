# Node-graph processing pipeline

Id: node-graph-pipeline

Status: exploratory — no graph code yet. Written 2026-09-30 from a code read of
`core/Runtime` + `core/*Processing`; no bead yet for the graph itself.
Revised 2026-10-01: "Prep work before importing libraries" added, fail-state
sanitizing corrected after Aurora-5y0. Revised 2026-10-02: Tuning edits to
live-tunable fields now apply without a reload (Aurora-c0g, prep 7).

Question: could users rewire Aurora's video/audio processing in a web
node editor (TouchDesigner/cables.gl-style) instead of the fixed pipelines?

## Prior coverage in the docs

No existing doc plans user-editable graphs. Nearest neighbours:

- [[distributed-architecture-plan]] — "`Output` doesn't care where a
  `Frame` came from"; its "routing graphs" are about network seams, not
  user-authored pipelines.
- [[implementation-plan]] Phase 5 — maps `Frame` fields onto ISF shader
  inputs: one fixed wiring, not a graph.
- `ControlDescriptors.hpp` — one-schema, per-module control registry
  served at `/api/descriptors`; the natural seed for a node-type catalog.
- `AudioProcessing.hpp`'s `AudioEffectSettings` comment anticipates a
  settings UI (sliders), not rewiring.

## Today's pipelines, read as graphs

Hardcoded in `Orchestrator::update()` / `AudioOrchestrator::update()`:

- **Video:** grab → `rescale` → `dropAlpha` → per zone `getSubImage(uvs)`
  → `getDominantColor` → `Frame` → `Smoother` → `IOutput::send`.
- **Audio:** buffer → `AudioFeatureExtractor` → `updateDrift` →
  `updateBounce` → one `Color` broadcast to all zones (`composeAudioFrame`)
  → `send`. No smoother on this path.
- Video and audio are mutually exclusive ("video wins" in `main()`).
  Mixing them (screen hue × beat brightness) is impossible today — the
  main new capability a graph would unlock.
- Both are already pure functions + explicit state structs
  (`DriftState`, `BounceState`, `Smoother`'s per-output map), which is
  most of what a node model needs.

## Proposed shape (not decided)

- **Port types = `Contracts`** (`ImageData`, `AudioBuffer`,
  `AudioFeatures`, `Color`, `Frame`, `UVs`) plus scalar `float`. Already
  the cross-boundary data shapes, so no new type layer.
- **`INode`**: declared inputs/outputs/params + `evaluate(ctx, dt)`;
  stateful nodes own their state struct.
- **One `Graph`** replaces both orchestrators: topo-sort at load,
  evaluate per tick. Images passed by reference, not copied.
- **Zones stay `Frame`-level**, not one node per zone (zone count is
  dynamic per output): `SampleZones(image, output) → Frame`,
  `Broadcast(color, output) → Frame`, Frame→Frame `Smooth`/`Gamma`/`Mix`.
  Zone maps stay in `ZoneMapStore`, keyed by output name.
- **Sink node per active `IOutput`.**
- **Config migration:** the flat `audio*` fields in `ConfigData` become
  node params; first boot synthesizes a default graph from existing
  config so behaviour is identical (the "refactor first, prove no
  regression" principle from [[implementation-plan]]).
- **Hot swap:** HTTP thread builds + validates a new graph, swapped in
  between ticks under a lock; state carried over by stable node id.
- **Routes:** `GET /api/nodes` (catalog, extends the descriptor
  registry), `GET`/`PUT /api/graph`.
- **Compile-time-plugin principle holds:** node *types* are compiled-in
  C++; the graph only wires them. No scripting. ISF shaders later fit as
  data-defined nodes (Phase 5).
- **`web-processing/`** JS mirror would need the same node set, or stays
  default-pipeline-only.

## Node inventory (proposed)

Derived from the real code: `ImageProcessing`, `FrameCompositor`,
`Smoother`, `AudioFeatureExtractor`, `AudioProcessing` (`updateDrift` /
`updateBounce`), `Color`.

**Port types needed:** `Image`, `AudioBuffer`, `Float`, `Angle`
(wrapping hue degrees), `Trigger` (one-tick event, e.g. an onset),
`Color`, `Frame`. `Angle` and `Trigger` aren't obvious from the current
structs but are needed: a plain float smoother breaks at the 359°→0°
wrap (hence `shortestArcDelta`), and `onsetDetected` is a pulse, not a
level.

### Tier 1 — parity (reproduce today exactly)

Coarse nodes wrapping existing functions unchanged, so existing tests
still cover them.

| Node | Wraps | Notes |
|---|---|---|
| `video.capture` | `IVideoInput::grabFrameSubsample` | Monitor param; skips the tick when `!isHealthy()` |
| `image.rescale` | `rescale` | width + interpolation params (today's `subsampleWidth`/`interpolation`) |
| `image.dropAlpha` | `dropAlpha` | Could stay implicit inside capture |
| `zones.sample` | `composeFrame` (`getSubImage` + `getDominantColor`) | Image + output → `Frame`; per-zone fan-out stays inside |
| `audio.capture` | `IAudioInput::readNextBuffer` | Empty buffer → no fresh data this tick |
| `audio.features` | `AudioFeatureExtractor` | Stateful (aubio). Split outputs: `rms`, `onset` (Trigger), `onsetStrength`, `centroid` (Hz) |
| `audio.drift` | `updateDrift` | Compound; owns `DriftState` + random anchor |
| `audio.bounce` | `updateBounce` | Compound; owns `BounceState`; outputs `Color` |
| `frame.broadcast` | `composeAudioFrame` | Color + output → `Frame` |
| `frame.smooth` | `Smoother` | Per-output, per-zone state |
| `output.send` | `IOutput::send` | Gamma stays in the output plugin (target-specific, per `Frame.hpp`) |

About 11 nodes. The built-in Video and Audio graphs are 6 and 5 of
these.

**Parity traps found in the code:**

- **Two time models.** `Smoother` is per-tick (`mix(prev, cur,
  1 - smoothing)`), so it behaves differently at 30Hz vs. 240Hz; the
  audio dampers are time-based (`1 - exp(-dt / τ)`). Parity keeps
  `frame.smooth` per-tick; new smoothing primitives should all be
  time-based, and a mixed graph makes the difference visible.
- **One clock per graph.** Today video ticks at `refreshRate` and audio
  at a fixed 1/60s (`main.cpp`). A mixed graph needs one tick rate
  (`refreshRate`) with `dt` in the eval context; audio nodes consume
  whatever has buffered since the last tick.
- `getDominantColor` is actually `mean` — name the reducer honestly
  (`reducer: mean`) so a real dominant-color reducer can be added later.

### Tier 2 — primitives (the compounds, decomposed)

What makes the editor worth having. Each compound above is expressible
in these; a parity test runs the decomposed graph against the compound
on recorded features and checks outputs match within epsilon.

- **Scalar math:** `scale`/`divide`, `clamp`, `mapRange`, `lerp`,
  `add`/`multiply`, `max`, `invert`.
- **Time/state:** `smooth.exp(τ)` (Float), `smooth.angle(τ)`
  (shortest-arc), `rollingAverage(α)`, `integrate(rate)` (Angle, wraps),
  `stepOnTrigger(amount)` (accumulate on each pulse).
- **Color:** `color.fromHSV`, `color.toHSV`, `color.brightness`,
  `color.mix`, `color.hueShift`, `color.complement` (+180°).
- **Palette:** `palette.randomAnchor` (the six complementary pairs),
  `palette.pick`.
- **Frame ops** (these enable video × audio mixing, the headline
  feature): `frame.mix(a, b, t)`, `frame.brightnessScale(Float)`,
  `frame.saturation`, `frame.hueShift`, `frame.tint(Color, amount)`.

Decomposition check: **drift** = centroid → `rollingAverage` → deviation
→ `divide(rangeHz)` → `clamp(-1,1)` → rate = base × (1 + k·x) → `max(0)`
→ `integrate(dir -1)`. **Bounce** = onset + strength → `lerp(floor, 1)` →
`×180` → `stepOnTrigger` → `smooth.angle(bounceτ)` → hue; rms →
`divide(refRms)` → `clamp(floor, 1)` → `smooth.exp(brightnessτ)` →
`×vibrancyValue` → V; `color.fromHSV(hue, S, V)`. Everything needed is
in the list above.

Compounds stay as the default building blocks in presets; once the
editor supports subgraphs, the built-ins can be shown as primitive
subgraphs instead.

### Stretch

- **Zone reducers:** median, true dominant (histogram / k-means),
  saturation-weighted mean (stops grey washing out color), brightest
  region; **letterbox/black-bar detection** to auto-crop sampling.
- **Image:** `image.crop(uvs)` + `image.reduce` for single-region
  effects, blur, colour correction; motion and detection (see "Stretch:
  object detection and motion").
- **Audio:** frequency bands (bass/mid/treble), beat tracking / BPM +
  beat phase (aubio `tempo`), pitch (aubio `pitch`), spectral flux,
  stereo L/R features (left zones vs. right zones), envelope follower
  with separate attack/release.
- **Generators:** LFO (sine/saw/square, free or BPM-synced), noise,
  clock; `trigger.flash` (hit-and-decay), gate/hold.
- **Spatial across zones:** chase, gradient along an axis, rotate
  colors between zones, per-zone hue spread. **Design point:** `Frame`
  is `{id, color, gamma}` with no position, so spatial nodes need zone
  geometry, either by `Frame` carrying a zone centroid or by nodes
  reading `ZoneMap`. Decide before Frame ops ship.
- **External control:** MIDI / OSC inputs as param drivers; ISF shader
  nodes (Phase 5).
- **Multiple outputs per graph** with different processing each.

## Saved graph format (sketch)

`graph.json` beside the existing config:

```json
{
  "version": 1,
  "nodes": [
    {"id": "cap",   "type": "video.capture",     "params": {"subsampleWidth": 0}},
    {"id": "aud",   "type": "audio.features",    "params": {}},
    {"id": "zones", "type": "video.sampleZones", "params": {"output": "hue"}},
    {"id": "beat",  "type": "audio.bounce",      "params": {"bounceSmoothTime": 0.285}},
    {"id": "mix",   "type": "frame.brightnessFrom", "params": {"amount": 0.7}},
    {"id": "out",   "type": "output.send",       "params": {"output": "hue"}}
  ],
  "edges": [
    ["cap.image", "zones.image"], ["aud.features", "beat.features"],
    ["zones.frame", "mix.frame"], ["beat.color", "mix.color"],
    ["mix.frame", "out.frame"]
  ],
  "ui": {"cap": {"x": 40, "y": 80}}
}
```

- Node ids are stable, never renamed — state survives edits.
- `ui` is editor-only layout; core ignores it. Keeps the core format
  independent of whichever editor library wins.
- Load validates against the node registry (unknown type, port-type
  mismatch, cycle, unregistered output name); on failure reject and keep
  the running graph.
- Top-level `version`, per-type versions later if migrations need them.

## UX: effects, tuning, tooltips (proposed)

Today's Video/Audio segmented control (`DashboardScreen._switchMode`)
switches *input* and *effect* together, and most of the Dashboard keys
off that `mode`: DeviceField (monitor vs. sink), Zone Mapping (video
only), Tuning's field set, the audio permission banner. Tuning edits
used to trigger a full `PipelineHost::reload()` (1-3s Hue DTLS
re-handshake); since Aurora-c0g only structural fields still do (see
"Live apply" below).

**Effects are siblings, not children, of Video/Audio.**

- A custom graph can use both inputs (screen hue × beat brightness), so
  it can't live under either tab.
- The segmented control becomes an Effect dropdown (existing
  `Dropdown`): built-ins first, divider, customs. Small badges
  (video / audio / both) replace hierarchy.
- Dashboard sections derive from the active graph, not `mode`: monitor
  picker iff a capture source node, sink picker + permission banner iff
  an audio source, Zone Mapping iff a `SampleZones` node. A mixed effect
  shows both device pickers.
- Onboarding (`ModeDeviceScreen`) still offers only the two built-ins.

**Built-ins: read-only, tunable, resettable, duplicable — not
deletable.**

- Built-in graphs ship in the binary, so a release can improve them and
  support always has a known baseline.
- *Tuning* a built-in stores a param overlay with "Reset to defaults";
  today's `audio*` config values migrate into the built-in Audio overlay.
- *Rewiring* a built-in forces "Duplicate → custom"; never in place.
- Customs are fully editable and deletable; deleting the active one
  confirms, then falls back to a built-in. "Hide built-in" deferred.
- Data: config holds `activeEffectId` + `paramOverrides[effectId]
  ["node.param"]`; each custom is its own file under an `effects/` dir.

**Tuning is populated from exposed params, not every param.**

- The node catalog (`/api/nodes`) declares each param's schema: key,
  label, kind (`float` / `enum` / `bool` / `optional-float`), min / max /
  step / unit, default.
- Only params the author marks "Show in Tuning" appear on the
  Dashboard, as a `controls` list in `graph.json`: `{node, param,
  group, label, order, tooltip?}` — the TouchDesigner custom-parameter /
  Blender group-input / Max presentation-mode pattern.
- Built-in graphs ship `controls` reproducing today's layout exactly
  (Response speed / Color character / Sensitivity); `TuningFields`
  becomes a generic renderer and its hardcoded slider tables go away.
- Today's special cases map onto kinds: the fixed-hue checkbox +
  slider → `optional-float`; subsample's monitor-dependent options → an
  enum whose options the server computes. Refresh rate stays app-level
  (it drives the tick loop, not a node).
- Param edits go to the live node — no reload, fixing today's
  1-3s-per-edit cost. Shipped for today's two pipelines as Aurora-c0g;
  the graph generalizes it to "set param on node".

**Tooltips: one registry, three resolution tiers.**

Existing system (see [[webui-tooltip-content]]): C++ modules contribute
`ControlDescriptor{key, kind, description}` to `DescriptorRegistry` →
`GET /api/descriptors` → `applyTooltip(el, key)` renders a native
`title`. Copy rules: ≤ 6 words, framed as what the control means for the
visible color output.

- **Node types contribute descriptors like any other module**, keyed
  `node.<type>.<param>` (e.g. `node.audio.bounce.bounceSmoothTime`) — no
  collision with existing namespaces, and a compiled-out node type just
  has no tooltip, same degradation as today.
- **Resolution for a Dashboard control:** the `controls` entry's own
  `tooltip` (graph author's override) → the node-param descriptor →
  none. The override matters because a param's meaning is often
  graph-specific: a `Mix.amount` means "beat's pull on brightness" in one
  graph and something else in another; the 6-word color-output framing
  is only truly writable at the graph level.
- **Built-ins keep today's approved copy verbatim** — the text moves
  from `audio.*`/`video.*` keys to the node-param descriptors (or the
  built-in's `controls` overrides) and must render identically:
  regression, not rewrite.
- **Two lengths, two audiences.** The Dashboard keeps the ≤ 6-word
  `description`. The editor needs more ("what this node computes", port
  meanings), so descriptors gain an optional longer `details` field,
  and node types get a node-level entry (`node.<type>`). The editor shows
  `details` inline in its inspector panel rather than on hover — sidesteps
  native `title`'s missing touch support, already deferred in
  [[webui-tooltips-analysis]].
- **Effect picker:** built-in effects carry authored descriptions
  (replacing `app.mode`'s "Video or audio reactive mode"); customs get
  a user-entered description in their effect metadata; badges get fixed
  tooltips ("Uses screen capture" / "Uses audio").
- **User-authored text is data:** rendered via `title`/text nodes only,
  never HTML. The editor shows a soft "≤ 6 words" hint for Dashboard
  tooltips; not enforced.
- `ControlDescriptor.kind` should derive from the param schema's kind
  for node params rather than being authored twice.

## Live preview and fail states (proposed)

**What exists today:** nothing product-grade. `DevLightTap` (per-zone
colors, UDP JSON line) and `DevFrameDump` (subsampled source frame, raw
base64 JSON) are dev-only, env-var gated, and reach the browser only
through `tools/light-viz-relay/relay.py` → SSE → `web/demo/viz.html`
(3D room rig). The native HTTP server has no streaming endpoint; the
SSE/MJPEG channel [[implementation-plan-phase-3]] planned was never
built.

**Reuse the shapes, not the dev path.** The relay's per-zone line and
`frame-apply.js`'s `[{zoneId, color}]` contract, plus `DevFrameDump`'s
raw-base64 image JSON (no image codec needed), are the right payloads.
Transport becomes a real native endpoint; the dev tools stay dev-only.

### Three preview surfaces

1. **Per-node previews (TouchDesigner-style), inside each node:**
   Image → small thumbnail (e.g. 64px wide); Color → swatch; Frame →
   strip of zone swatches; Float → sparkline; Angle → dot on a hue ring;
   Trigger → blink. Only for nodes on screen or selected (the editor
   subscribes by node id), so a large graph doesn't stream everything.
2. **Output preview, the corner thumbnail:** a 2D zone map (the
   screen's UV layout with each zone rect filled with its live color),
   i.e. the light viz without 3D models. Geometry already exists in the
   WebUI's `ZoneCanvas`; the React editor reimplements the drawing, not
   the data. `viz.html`'s 3D room stays available as an optional
   pop-out.
3. **Test on lights:** the draft drives the real output (below).

### Draft vs. live graph

- The editor always edits a **draft**; the **live** graph keeps
  driving the lights until the user applies.
- **Preview mode (default):** the runtime evaluates the draft alongside
  live in the same tick, sharing the source nodes' capture (never
  capturing twice), with its outputs swapped for preview sinks that
  never touch Hue. Cost is roughly double the processing; negligible at
  subsample widths, but expensive nodes (stretch detection) should be
  shared between the two graphs rather than duplicated.
- **Test on lights:** the draft temporarily replaces live on the real
  output. It **auto-reverts** on an explicit "Revert", on a timeout
  unless confirmed (the OS display-resolution "Keep changes?" pattern),
  or when the editor stops heartbeating (tab closed, laptop asleep).
  Revert is server-side, so a vanished browser can't strand broken
  lights.
- Apply = draft becomes live (the existing validate-then-swap path).
  Drafts save even when invalid, so work is never lost; only applying
  requires a valid graph.

### Transport

- **SSE** (`GET /api/graph/preview`), matching the one-way channel
  [[implementation-plan-phase-3]] chose; subscription changes (which
  nodes are visible) go over a separate `PUT` keyed by a session id.
- **Throttle below the tick rate:** values ~15Hz, thumbnails ~5Hz;
  the runtime samples the latest value rather than queuing every tick.
- React side: preview values go to refs/canvas drawing, not React state
  per update (the throttling note under "Library evaluation").
- This is the first feature that really wants a bidirectional channel;
  worth noting against the deferred WebSockets fork in
  [[distributed-architecture-plan]], but SSE + PUT is enough for v1.

### Fail states

Three categories, handled differently:

- **Invalid graph (static):** type mismatch, cycle, missing required
  input, unknown node type (graph from a newer build, or a compiled-out
  plugin), unregistered output. *Prevent first:* the editor refuses
  mismatched or cyclic connections at drag time (React Flow's
  `isValidConnection`). Server validation stays authoritative; the
  failing node gets an error badge with the message. Can't be applied.
- **Runtime error in a node:** exception, NaN/Inf, model failed to
  load, etc. The node emits an **error value** instead of data, and
  downstream nodes propagate it (NaN-style poisoning, but with the
  originating node id attached). The editor highlights the path from
  the failing node to the affected outputs.
- **Stale / no data:** source unhealthy (e.g. macOS capture torn down on
  screen lock), audio silent, detection lagging. A warning state
  (amber), not an error: the last value holds, age shown.

**Magenta, where it's safe:**

- In **preview surfaces**, the error value renders as the shader
  convention: `#FF00FF`, so an affected zone or thumbnail is
  unmistakable. It needs a pattern too (magenta/black checker or
  stripes) plus an icon, because a valid graph can legitimately output
  magenta and colour alone isn't accessible.
- On **real lights**, not by default: a room suddenly flooding magenta
  (or strobing between error and good) is jarring and a
  photosensitivity risk. Live graph: failing node holds its last good
  value; if the error persists, fall back to the last-known-good graph
  (the hot-swap design already keeps it). Test-on-lights: optional "show
  errors on lights" toggle, off by default, steady magenta and never
  flashing.
- **Sanitize at float → `Color`, not at the output.** `Color` and
  `Frame` hold `uint8_t` channels, so a NaN can't travel along a Color
  or Frame port; the UB happens where floats are cast into a `Color`.
  That is `Color::fromNormalized`, the single guarded cast site
  (non-finite → black, out-of-range clamps; Aurora-9ca, Aurora-5y0), now
  used by both `fromHSV` and `Smoother`. Any node that produces a `Color`
  from floats must go through it. Non-finite *Float/Angle* port values
  are the graph's concern: they become the error value above.
- **Stateful nodes must self-heal.** NaN + x and `fmod(NaN)` stay NaN, so
  one bad tick poisons a state struct for the rest of the session: under
  9ca's first fix, a zero centroid range left `DriftState`'s anchor NaN and
  the lights black until restart. "Hold last good value" covers a node's
  *outputs*, not its *state*. `updateDrift`/`updateBounce` now reset to
  cold-start state when a field goes non-finite (Aurora-5y0); `INode`
  should make that a contract (e.g. a per-node state check after
  `evaluate`), not something each node remembers.

## Stretch: object detection and motion

Status: stretch — recorded so the core graph design doesn't preclude it.

**Already scoped:** [[open-formats-research]]'s "Integrating YOLO-style
object detection" (also [[implementation-plan]]'s stretch list) settles
the shape: a Processing-stage analyzer consuming `ImageData`; bounding
boxes reuse `UVs` (the same normalized rect zones use); Frigate-style
persistent track ids until an end event, not stateless per-frame
blobs; detections expected to lag raw frames. **Not scoped anywhere:**
motion vectors / optical flow.

**How it maps onto nodes:**

- New `Contracts` port types: `Detections` (`{trackId, class,
  confidence, UVs}` list) and `Motion` (global vector + per-zone
  magnitude/direction; a full flow field stays internal).
- Nodes:
  - `video.motion` — image → `Motion`. Stateful (keeps the previous
    frame), same pattern as `DriftState`. Cheap at subsample widths, so
    it can run every tick. Cheapest variant is frame differencing
    (`absdiff`, already in `imgproc`); richer is dense flow (Farneback /
    DIS in OpenCV's `video` module).
  - `video.detect` — image → `Detections` (YOLO-style model, ONNX).
  - `detections.track` — stable ids from raw detections (IoU /
    ByteTrack-style), so effects anchored to an object don't strobe.
  - `detections.toZones` — detection boxes as *dynamic zones*
    ("light follows the person"), or zone-overlap → brightness.
- Lighting uses: motion energy per zone → brightness/flash; dominant
  direction → a chase across zones; detections → which zones react.
- ISF tie-in: Phase 5's `point2D` shader inputs can take detection
  centers or motion vectors — the XR target is where screen *position*
  genuinely pays off, since a bulb can't be at a screen position.
- [[distributed-architecture-plan]]'s "smart camera" fork becomes a
  source node that emits `Detections` directly.

**What the core design must allow now (cheap to keep, expensive to
retrofit):**

- **Async nodes.** A detector can't run inside a 60-240Hz tick. `INode`
  needs an async variant: work on a worker thread, `evaluate()` returns
  the latest result plus its age, never blocks. Downstream nodes treat
  staleness as normal, as the research doc already requires.
- **Sampling resolution per node, not global.** Detection wants a
  320-640px input; color sampling is fine smaller. `subsampleWidth`
  becomes a param on whichever node consumes the image, not one app-wide
  setting.

**Dependencies and risks (unverified):**

- OpenCV `dnn` + `video` are already installed wherever Aurora builds
  (Ubuntu's `libopencv-dev`, vcpkg's default `opencv4` features, per
  `Building.md`); core only asks for `imgproc` today. Adding
  `COMPONENTS dnn video` is likely no new dependency.
- Ubuntu's OpenCV 4.6 may be too old for recent YOLO ONNX exports;
  check before relying on `cv::dnn`. ONNX Runtime is the fallback (GPU
  execution providers, a real new dependency).
- **Model licences:** Ultralytics YOLOv5/v8/v11 weights and code are
  AGPL-3.0. Combining with GPLv3 is allowed, but AGPL's network clause
  would apply because Aurora serves a WebUI. Permissive alternatives
  (e.g. YOLOX, RT-DETR — Apache-2.0) need their licences verified before
  choosing.
- CPU inference cost on the target machines is unmeasured; likely
  needs a lower detection cadence or GPU.

## Prep work before importing libraries

Status: proposed 2026-10-01 (item 2 shipped as Aurora-5y0; item 3 shipped as
Aurora-tft, fixtures verified on Mac only; item 4 shipped as Aurora-skv;
item 1 shipped as Aurora-ta5; item 6 shipped as Aurora-9ig). Each item
works under today's two orchestrators, needs no new dependency, and
removes a risk the graph work or the React Flow import would otherwise
hit.

1. **Param schema in C++, single source.** Shipped (Aurora-ta5):
   `Contracts::ParamSchema` (label, min, max, step, unit, default,
   allowsUnset) rides on `ControlDescriptor`; the 12 numeric settings'
   descriptors carry it, defaults read from `ConfigData{}`. Every numeric
   `Config` setter and `Config(ConfigData)` clamp through
   `sanitizeParam`, so REST and hand-edited `config.json` match (5y0's
   loader stopgap removed). `/api/descriptors` serves it; `TuningFields`
   keeps only layout (which keys per section) and builds sliders from it.
   Dropdown option lists (refresh presets, interpolation names, subsample
   candidates) stay where they were. This is the `/api/nodes` param shape.
2. **One guarded float → `Color` path.** Shipped: `Color::fromNormalized`
   (see "Fail states").
3. **Parity harness.** Built: `core/tests/{Video,Audio}ParityTests.cpp`
   + `GoldenFrames.hpp`, fixtures in `core/tests/golden/`. Inputs are
   generated per tick in code (no binary fixtures); audio runs both PCM
   through `AudioOrchestrator` (incl. aubio) and scripted `AudioFeatures`
   straight into `updateDrift`/`updateBounce` (the Tier 2 reference).
   Regenerate with `AURORA_UPDATE_GOLDEN=1`. First finding: drift never
   reaches the output (Aurora-7r3).
4. **Explicit `dt` and one clock.** Shipped: both orchestrators take
   `update(dt)`; `Runtime::tickIntervalSeconds(rate)` (`TickClock.hpp`) is
   the one rate rule (display refresh, else 60Hz) for all three apps, and
   `PipelineHost::tick()` passes the interval as `dt` under its lock.
   Behaviour unchanged: dt is the nominal interval (not measured), video
   ignores it (Smoother stays per-tick), audio still ticks at 60Hz.
   Measured dt and audio at the display rate are graph-time decisions.
5. **Toolchain spike.** A hello-world Vite + React app built by CMake,
   embedded, served, and run on all three CI workflows, before any real
   editor code. What it should shake out:
   - **MSVC literal limit (unverified).** MSVC is believed to cap a
     *concatenated* string literal near 64 KB (C1091);
     `embed_webroot.py` assumes no total limit. Untested so far: the
     largest embedded file is 40 KB, while React + xyflow minified is
     likely 200 KB+. If it bites, emit byte arrays instead.
   - **Serving.** `HttpLibServerImpl`'s MIME table lacks `.mjs`, `.map`,
     `.woff2`, `.wasm`, `.webp`; a sub-app at `/graph-editor/` needs
     index fallback and a matching Vite `base`.
   - **CI.** `web.yml` assumes no build step; the Linux and Windows
     workflows have no Node.
   - **Licences.** `tools/mac/bundle-licenses.sh` covers Mac dylibs only;
     npm packages compiled into the binary get no third-party notices on
     any platform. Generate one at build time (e.g.
     `rollup-plugin-license`) and ship it.
   - **Supply chain.** Committed lockfile, `npm ci --ignore-scripts`.

6. **One Pipeline, in core.** Shipped (Aurora-9ig, [[9ig-pipeline-to-core]]):
   `Registry`, `Pipeline`/`PipelineHost` and the monitors/reload routes
   live in `core/Runtime`; each app passes `PipelineOptions`. POST
   /api/reload and Hue pairing go through `reloadPipelineFromDisk`
   (always rebuild); a settings PUT goes through `applyConfigFromDisk`
   (see "Live apply"). Follow-ups: Aurora-kea, Aurora-o13.

7. **Live apply.** Shipped (Aurora-c0g, [[c0g-live-tuning-apply]]).
   `Pipeline::applyConfig` diffs the Config it was built from against the
   new one; `ConfigApply` classifies each persisted field as hot, reload
   or no-effect (an unclassified field reloads, and a test fails until it
   is classified). Hot fields swap into the live orchestrator under the
   `PipelineHost` lock; the Mac capture-width call runs after the lock is
   released. Open: whether sliders PUT while dragging instead of on
   release.

## Open questions

- Editor library — decided: React Flow, built by CMake; see "Library
  evaluation" below.
- Whether simple mode (today's two pipelines) stays the default UX,
  with the graph editor as an advanced screen over preset graphs.
- Whether graph evaluation cost matters at 240Hz with many zones —
  expected negligible at subsample widths, unmeasured.
- Interaction with [[distributed-architecture-plan]]'s seam question: a
  graph spanning processes would need edges to serialize as `Contracts`
  data; not in scope here.

## Library evaluation

Researched 2026-09-30 (GitHub API, npm registry, project docs).
Originally evaluated against `web/ui/README.md`'s "no build step and no npm"
rule; **that rule is waived for the graph editor** (owner decision,
2026-09-30) — RockyRoad v2 already runs a Vite + TypeScript + npm
frontend, so the toolchain is known ground. Still binding: the WebUI is
embedded in the app binaries (`aurora_embed_webroot` over the fetched
`web/ui` source dir), so no runtime CDN fetches.

**LiteGraph.js** (MIT) — best fit for the constraint.

- One file, zero dependencies, loads via a plain `<script>` tag; Canvas2D
  editor with search box, context menu, subgraphs, typed slots, widgets.
- Upstream `jagenjo/litegraph.js` is dormant: last push 2024-08, last npm
  release 0.7.18 (2024-01).
- Comfy's maintained fork (`@comfyorg/litegraph`, final npm 0.17.2,
  2025-08) is archived: merged into the GPL-3.0 ComfyUI_frontend monorepo
  (Vue/TS), no longer published as a package. Licence compatible with
  Aurora's GPLv3, but extracting it means owning a fork.
- Practical shape: vendor a pinned copy, use only its editor +
  `serialize()`/`configure()`, never its JS execution engine (C++ runs
  the graph). Its serialized form (ComfyUI-workflow style: `nodes` with
  `pos`/`size`/`widgets_values`, `links` as positional arrays) mixes
  layout with semantics, so translate to/from `graph.json` rather than
  storing it directly.
- Weaknesses: canvas rendering can't reuse `web/ui/styles` tokens or the
  existing DOM components (sliders, dropdowns, tooltips); themed via its
  own config instead. Touch/phone usability unverified.

**React Flow / xyflow** (MIT) — best library, wrong fit today.

- Actively maintained: 38.5k stars, `@xyflow/react` 12.12.0 released
  2026-09-24; Svelte Flow sibling on the same `@xyflow/system` core.
- DOM nodes, so custom node bodies are plain HTML — could reuse Aurora's
  CSS tokens and components; strong touch support.
- Requires React (or Svelte) plus a bundler; no official vanilla binding
  (open request: xyflow discussion #4232). Adopting it breaks the WebUI's
  no-build rule, or means a separately built editor bundle checked in.
- Save/restore via `toObject()` → `{nodes, edges, viewport}`; per-node
  `data` is free-form, maps cleanly onto `params`. Still worth
  translating to `graph.json` so the core format isn't library-owned.

**cables.gl** (MIT since Aug 2024, NLnet-funded) — not an editor
library; a complete browser VJ environment with its own runtime.

- WebGL-first patching tool with its own op library, JS runtime, and an
  offline Electron "standalone"; patches are JSON `.cables` files.
- The editor (`cables_ui`) is tightly coupled to cables' own core and
  runtime — not designed to drive an external C++ graph. Using it as
  Aurora's editor would mean two runtimes disagreeing about semantics.
- Where it genuinely fits:
  - **As an external consumer/producer**, per
    [[distributed-architecture-plan]]'s "a `Frame` from any source":
    cables has WebSocket receive/send ops (`Ops.Net.WebSocket.*`) and
    OSC ops, and an exported patch exposes
    `CABLES.patch.setVariable(name, value)` to host JS. A user could
    build visuals driven by Aurora's `Frame`/`AudioFeatures`, or compute
    colors in cables and hand Aurora a `Frame` back. Ties into the
    deferred WebSockets stretch goal (Aurora only has SSE today).
  - **As a Phase 5 alternative/complement to ISF** for the WebXR visual
    layer.
  - **As a UX reference** for op naming, port typing, and patch UX.

**Direction:** React Flow (`@xyflow/react`) as the editor, over Aurora's
own `graph.json` via a thin adapter so the editor stays swappable.
LiteGraph's only advantage was fitting the no-build rule, now waived;
React Flow wins on maintenance, DOM-based nodes (reuses Aurora's CSS
tokens), and touch. Treat cables as an integration target, not an editor.

**Integration shape (proposed):**

- Editor is its own Vite + React + TS sub-app (e.g. `web/graph-editor/`),
  not a rewrite of the existing vanilla WebUI; the rest of `web/ui`
  stays as-is and links to the editor screen.
- RockyRoad v2's `package.json`/`vite.config.ts` is the toolchain
  template (Vite 7, TS 5.9, Node ≥ 20.19). RockyRoad has no React, so
  React itself is new to both repos.
- Node types in the editor come from `GET /api/nodes`, not hardcoded in
  React — one generic node component renders any catalog entry's ports
  and params, so adding a C++ node type needs no frontend change (same
  principle as the descriptor registry).

**Decided (2026-09-30): CMake runs the npm build.** Both
`app/*/CMakeLists.txt` embed `web/ui` straight from source; the editor's
`npm ci && npm run build` runs as a CMake step before
`aurora_embed_webroot`, so the embedded bundle is never stale. Rejected:
committing Vite's `dist/` (keeps the C++ build Node-free, but bundles
drift from source).

Consequences to carry when this is built:

- Node (≥ 20.19, matching RockyRoad) joins every platform's build
  prerequisites — `Building.md`'s per-platform lists and the verified
  bare-Windows recipe (`winget install OpenJS.NodeJS.LTS`) need updating.
- `npm ci` needs network on a clean build; offline/packager builds
  (Linux `DESTDIR`) need a pre-populated `node_modules` or npm cache.
- The build step should declare the editor's sources as dependencies so
  an unchanged editor doesn't rebuild on every C++ build.

Unverified: cables WebSocket ops' message format; React Flow
performance with live per-tick value previews on nodes (keep previews
throttled/out of React state if it bites).
