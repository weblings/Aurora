# Node data conversion: audit and gaps

Id: node-conversion-gaps

Status: exploratory. Written 2026-11-18 from a code read of the graph node
registry and a short web survey of other node editors. Revised the same day
with an effect-first pass, recipes, and a proposed release split. Filed:
Aurora-4g4d (how recipes ship), Aurora-q66y (`trigger.envelope`), Aurora-h87j
(`math.step`). Related: [[node-graph-pipeline]], [[api-v1-review]].

## Why this exists

Graphs can only be as useful as their nodes. This doc records what moves
between nodes, which effects users would try that the catalog cannot build,
how to build the ones it can, and what to add in 1.2.0 versus later.

## Port types today

Source: `core/Runtime/src/Graph/GraphTypes.cpp` (PortType enum) and
`GraphValue.hpp` (variant).

| Type | Representation |
|---|---|
| Image | `shared_ptr<ImageData>`: a `cv::Mat` plus a pixel format (RGB, RGBA, BGR, BGRA). Shared, never copied. |
| Frame | `vector<Zone>`, each Zone `{uint8 id, Color color, float gamma}` |
| Color | three `uint8` channels, no alpha |
| Float | `float` |
| Angle | `struct {float degrees}`, a distinct type |
| Trigger | `struct {bool fired}`, sent every tick (true for one tick) |
| AudioBuffer | samples, sample rate, channel count |
| AudioFeatures | onset flag and strength, rms, spectral centroid |

Absent and GraphError flow on any port and are not port types.

Not present: Bool (a held true or false), Int, UVs, any per-pixel or
single-channel plane type.

Validation allows no implicit coercion. A mismatch is a hard
`port_type_mismatch` error, with a hint toward `angle.fromFloat` and
`angle.toFloat` (`GraphLoader.cpp`). The editor's Float and Angle "auto
conversion" is not implicit either: dropping that wire inserts a real converter
node (`insertConverter` in `web/graph-editor/src/graph/connection.ts`), so the
saved graph stays explicit.

## Conversions that exist

| From to | Node |
|---|---|
| Float and Angle | `angle.fromFloat`, `angle.toFloat` |
| Color to Angle, Float, Float | `color.toHSV` |
| Color to Float | `color.brightness` |
| Angle, Float, Float to Color | `color.fromHSV` |
| Float to Color | `color.fromGradient` |
| Color to Frame | `frame.broadcast` |
| Image to Frame | `zones.sample` (a mean per zone) |
| Float or Color to Image | `image.gradient`, `image.bar`, `image.noise`, `image.hueRamp` |
| Trigger to Angle | `stepOnTrigger` |
| AudioBuffer to features, Float, Trigger | `audio.features`, `audio.bands` |
| AudioFeatures to Angle or Color | `audio.drift`, `audio.bounce` |

Same-type nodes: Float math (scale, divide, clamp, mapRange, lerp, add,
multiply, max, invert, step), smoothing, Frame ops (smooth, gain, floor, brightness,
saturation, hueShift, tint, and mix with normal, add, multiply, screen and
difference modes), Image ops (rescale, dropAlpha, mix with the same modes) and
Color ops (mix, hueShift, complement).

## Type-level gaps

- **Color:** no RGB split or combine (only HSV). No Color gain, saturation or
  brightness node (the Frame versions exist, and `color.toHSV` and
  `color.fromHSV` stand in).
- **Image:** no channel split or combine, no per-pixel map, no Image to Float
  stats (mean, luma). No blur, crop or arithmetic beyond `image.mix` modes.
  Nothing converts Frame back to Color or Image.
- **Frame:** no reducers (Frame to Color or Float). No per-zone get or set by
  id.
- **Float and Trigger:** no threshold or change detection (Float to Trigger),
  no envelope (Trigger to Float), no hold, no Trigger logic.
- **Bool and Int:** neither exists. Float 0 and 1 already work as a switch
  through `mapRange` and the `t` input of the mix nodes, so Bool is mostly
  about readability, not reach.
- **UVs:** no port type. Zone UV rects exist in the ZoneMap and are used inside
  `zones.sample`, but are never exposed on a port.
- **AudioFeatures:** can only be split through `audio.features` outputs, with
  no combine.
- **Invert:** not a real gap for lights. `frame.hueShift` at 180 and
  `color.complement` turn red into cyan, which matches an RGB negative for
  saturated colors. They differ only for greys and dark colors.

Already planned in [[node-graph-pipeline]] (Stretch section): zone reducers
(median, dominant, brightest), `image.crop(uvs)` and `image.reduce`, blur and
color correction. `trigger.flash` and gate or hold became `trigger.envelope`.

## Effects users would try

This list starts from effects rather than types, checked against the port types
in the editor's catalog sample (`web/graph-editor/src/graph/server-samples/nodes.json`).
The recipes were not built and run as graphs, so verify each before publishing
it.

### Buildable today (recipes)

Chains read left to right, with params in brackets.

- **Lights opposite the screen.** In the Screen colors graph, insert
  `frame.hueShift [degrees 180]` between `zones.sample` and `frame.smooth`, so
  the ease smooths the colors the lights show. Greys and blacks have no hue and
  stay as they are.
- **Loudness switch between two looks.** `audio.features.rms ->
  math.step [edge 0.32, hysteresis 0.03] -> frame.mix.t`, with look A on `a`
  and look B on `b`. The step is the threshold and the mix is the select. The
  hysteresis band keeps it from flickering when the level sits near the edge.
  (Before `math.step` this used a narrow `math.mapRange`, which flickered.)
- **Bass, mids and treble as red, green and blue.** Three
  `color.constant -> frame.broadcast -> frame.brightnessScale` chains, with
  `audio.bands` bass, mid and treble on each `factor`. Combine them with two
  `frame.mix [mode add, t 1]`.
- **VU meter filling across the room.** `audio.features.rms ->
  math.mapRange [outMin -0.5, outMax 0.5] -> image.bar.position [size 1,
  wrap false] -> zones.sample`. This relies on the wired `position` not being
  clamped (`SpatialNodes.cpp`).
- **Moving level dot.** As above with the default `size` and position 0 to 1.
- **Rainbow chase.** `integrate [rate as degrees per second] ->
  angle.toFloat [scale 1] -> image.hueRamp.phase -> zones.sample`. Swap
  `integrate` for `stepOnTrigger` on `audio.features.onset` to step the chase on
  each beat.
- **Gradient scroll.** `lfo [shape saw] -> image.gradient.phase ->
  zones.sample`.
- **Twinkle.** `image.noise [cells about one per zone] -> zones.sample`.
- **Screen colors pulsing with the music.** `audio.features.rms ->
  smooth.exp -> math.mapRange [outMin 0.6, outMax 1] ->
  frame.brightnessScale.factor`, on the `zones.sample` Frame.
- **Audio color layered over the screen.** Screen Frame on `frame.mix.a`, an
  `audio.bounce -> frame.broadcast` Frame on `b`, `mode screen`, `t` from
  `rms`.

### Not buildable, by missing building block

1. **Shaping events over time** (Float to Trigger, Trigger to Float, hold).
   - Beat flash with a sharp hit and slow decay. `smooth.exp` eases both ways,
     so it cannot give a fast attack. Now `trigger.envelope` (Aurora-q66y).
   - A switch that does not flicker near its threshold (hysteresis), now
     `math.step` (Aurora-h87j).
   - React to a drop or a scene cut (change detection).
   - Stay on for N seconds after a hit (hold), also `trigger.envelope`.
2. **Reducers** (Frame or Image to Color or Float).
   - Dim the room in dark scenes, or the reverse.
   - One color for every light from the whole screen, whatever the layout. A
     single zone covering the full screen does this today, but only in layouts
     that have one.
   - Use the screen's color as the accent of an audio effect.
   - These want an Image reducer. A Frame reducer averages zone colors and
     depends on the layout, so it is the wrong tool for screen-wide answers.
3. **Targeting specific lights.**
   - The lamp behind the TV follows the screen while the others pulse with
     the bass.
   - A masked mix (blend by region or zone) instead of one global blend.
   - Needs a way for a graph to name zones that survives a different room or
     layout.
4. **Time.**
   - Warmer lights after sunset, slow fades on a schedule. No clock or time of
     day source. The WASM demo needs a deterministic answer for it too.

Color-level RGB combine and per-channel Color work also fall outside, but the
Frame-level recipe above covers the main effect people want from them.

### Publishing the recipes

Decision proposed 2026-11-19 for Aurora-4g4d (not yet accepted by the owner).

**Existing mechanism.** The editor's clipboard (Aurora-ge1i.2.1) already reads
and writes marked JSON: `CLIP_MARK` (`aurora-graph-clip`), `parseClip` and
`pasteSelection` in `web/graph-editor/src/graph/doc.ts`, `pasteText` in
`App.tsx`. A paste remaps ids and wires, keeps layout and Tuning controls, and
skips unknown node types with a note. A recipe shipped as a clip needs no new
import code: the page only has to put the clip on the clipboard.

**Proposed form.** A recipes page on the GitHub Pages site (next to the demo
editor), one card per recipe, each with a Copy button. Starter graphs in Start
from and MCP entries are deferred:

- Start from replaces the whole graph. Several recipes modify an existing graph
  (lights opposite the screen inserts a node into Screen colors), so they fit
  as paste fragments, not starters.
- MCP and `list_presets` serve agents, a second audience. File them once users
  have the page, reading the same files.

**First audience:** users. **Source:** `docs/recipes/<name>.clip.json`, one file
per recipe. The page is generated from those files, so it cannot drift from
what pastes. A test runs every file through `parseClip` and `pasteSelection`
against the catalog sample, so a renamed node or port fails CI.

**Verification before a recipe ships:** paste it into the editor on the fake
light viz stack and watch the output, and log the result on the recipe's bead.
Audio recipes also get a real-lights check for feel. Layout-dependent recipes
(anything through `zones.sample`) say so on the card.

**Follow-ups to file:** the clip schema and drift test; the page generator;
building and verifying the clips (one bead per recipe or small batch); an
optional MCP resource reading the same files; an optional URL import.

#### Research behind it (2026-11-19, standard web searches)

- **Node-RED:** the Flow Library says to copy the JSON and use the editor's
  Clipboard import. Pasting a whole "all flows" export can silently fail while
  single flows import fine, which argues for one small clip per recipe. See
  [FlowFuse](https://flowfuse.com/blog/2023/03/3-quick-node-red-tips-5/) and
  [UMH](https://learn.umh.app/course/importing-and-exporting-in-node-red).
- **WLED:** no official preset library. People share raw JSON in forum threads
  and whole-file `presets.json` backups, and shared presets break across setups
  because LED counts and segments differ. See the
  [Home Assistant forum collection](https://community.home-assistant.io/t/ultimate-wled-scenes-collection-pre-configured-brilliance-to-a-world-of-vivid-light-scenes/710995)
  and [WLED discourse](https://wled.discourse.group/t/preset-sharing/10292).
  Aurora's zone-based recipes carry the same risk, so cards state their layout
  dependence and `pasteNote` reports what was skipped.
- **Home Assistant blueprints:** import by URL with a preview and a trust
  warning, and the source URL is kept for updates
  ([docs](https://www.home-assistant.io/integrations/blueprint)). Discovery was
  a complaint ([forum thread](https://community.home-assistant.io/t/wth-do-i-have-to-go-to-a-strange-forum-to-search-for-blueprints/805982)),
  the same problem as this bead. URL import is a possible later step; it adds
  trust UI that Copy and Paste does not need.
- **Blender:** the [Copy/Paste Nodes add-on](https://extensions.blender.org/add-ons/copy-paste-nodes/)
  puts nodes on the system clipboard as JSON text, the same mechanism as
  `aurora-graph-clip`.
- **Clipboard API:** `navigator.clipboard.writeText` needs a secure context and
  a user gesture, and fails in cross-origin iframes
  ([MDN](https://developer.mozilla.org/docs/Web/API/Clipboard/writeText)).
  GitHub Pages is HTTPS, so Copy works there. A file opened from disk or a
  LAN `http://` address needs the fallback below. Not checked: where the
  Aurora app itself serves its UI.

#### Recipe list review (2026-11-19)

Checked against the presets in `core/Runtime/src/PresetRoutes.cpp` (Screen
colors, Music colors, Screen colors with bass pulse, Rainbow sweep). Four
recipes overlap them or each other, and none has been run:

- **Rainbow chase:** the Rainbow sweep preset is the same chain (`lfo saw ->
  image.hueRamp.phase -> zones.sample`). Only the beat-stepped variant
  (`stepOnTrigger` on `audio.features.onset`) is new. Ship that one as
  "Beat-stepped chase".
- **Gradient scroll:** Rainbow sweep with a different image node. Cut, or a note.
- **Screen colors pulsing with the music:** close to Screen colors with bass
  pulse (rms instead of bass). Cut.
- **Moving level dot:** fold into VU meter fill as a size change.
- **Twinkle:** the least defined (`image.noise` "about one per zone"). Owner
  will supply the Candle effect graph from another machine when Aurora-4g4d.1
  starts; use it as this recipe in place of the sketch.
- **VU meter fill:** relies on `image.bar.position` not being clamped
  (`SpatialNodes.cpp`), so it needs a fake-lights run before it ships.

Seven remain: lights opposite the screen, loudness switch, bands as RGB, VU
meter fill, beat-stepped chase, Twinkle (Candle), audio layered over the screen.

#### Page layout

Being settled in Aurora-4g4d.1 (mock chain diagrams as generated SVG, a live
read-only viewer, or screenshots; then the layout). Agreed so far: Grille
`Header` and `Button` only, one flat list with a single how-to line at the top,
each row showing name, description, In and Out lines and the chain, with Copy.
No search, tabs, disclosure or Open the editor button. Grille gaps to record
there: card, tag, copy feedback, code-style chain.

## How other editors handle it

The survey was one standard search per tool, so treat the details as pointers
to verify before relying on them.

- **Blender Geometry Nodes:** sockets convert implicitly where it makes sense
  (color to vector, color to float as grayscale). The legacy Attribute Convert
  node was replaced by Math, Combine and Separate nodes. See the
  [attributes reference](https://docs.blender.org/manual/en/4.1/modeling/geometry_nodes/attributes_reference.html).
- **TouchDesigner:** operators wire only within a family (TOP image, CHOP
  channels, SOP geometry). Explicit converters bridge families, such as TOP to
  CHOP for pixels to channels. See
  [Derivative's operator guide](https://derivative.ca/solr/operator) and
  [CHOP to SOP](https://derivative.ca/UserGuide/CHOP_to_SOP). This is the
  closest analogue to Image versus Frame.
- **Unreal Material Editor:** AppendVector and ComponentMask are the combine
  and split pair, and a Float is reused against wider types in arithmetic. See
  [Epic's data manipulation docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/material-data-manipulation-and-arithmetic-in-unreal-engine).
- **Unity Shader Graph:** Split, Combine and Swizzle are standard. See
  [Channel Nodes](https://docs.unity3d.com/Packages/com.unity.shadergraph@17.3/manual/Channel-Nodes.html).
  Implicit conversion rules were not confirmed.

Compared with that baseline, Aurora is strict (no coercion), which fits the
TouchDesigner style. Strictness makes the converter nodes more important than
in Blender or Unreal, where implicit rules hide the gap. The editor's converter
insertion keeps that strictness in the file while saving the user a step.

## Shader-graph model versus ours

A shader graph describes one pixel. The GPU runs it for every pixel, so UV,
Sample Texture, Split, Invert and Combine all work on scalars or small
vectors, and the per-pixel loop is implicit.

Aurora's graph runs once per tick over whole values. An Image port carries the
entire frame and a Frame port carries all zones. A node loops over pixels or
zones internally. So the shader chain (sample uv and texture, split rgba,
invert channel, recombine, output) cannot be built from current nodes, because
there is no pixel scope. A Float invert here is one number per tick.

Two ways to get there:

1. **Whole-image nodes (current style).** `image.invert` takes an Image and
   returns an Image. Simple and fast, but one node per operation. A
   single-channel Image variant (a plane) lets Split and Combine exist as
   Image to planes to Image, with Math nodes applying to every pixel at once.
   A plane differs from a Float in that it has dimensions, so sizes must match
   and cost scales with pixel count.
2. **Per-pixel subgraph (the shader way).** An `image.map` node holds an inner
   graph run once per pixel, with UV and Sample as inputs. Full flexibility,
   but a much bigger feature: it needs a pixel-scope evaluator (compiled
   kernel, WASM loop or a shader backend) in both the app and the demo, plus a
   latency budget at screen resolutions.

UVs would enable `image.sample(image, uv)`, `image.crop(uvs)` and UV
generators. Without a pixel scope they still help for region work such as
average of a rect or a left and right split.

## API impact

`/api/v1/nodes` is in the frozen v1 spec, but its schema fixes only the shape:
node `type` and port type names are plain strings, and `portTypes` is a
self-describing `{name, meaning}` list built from `allPortTypes()`. New nodes
and a new port type such as Bool return the same shape, so both are additive
under the SemVer rule in [[api-v1-review]].

Two conditions keep that true:

- The v1 adapter doc should say clients tolerate unknown node types and port
  types, as it already does for state values and error codes.
- No existing port changes type later. A node that ships with a Float or
  Trigger output must keep it when Bool arrives.

Not decided: whether new nodes alone bump the `apiVersion` minor, or only new
port types and fields do.

## Proposed release split

Status: proposed, not decided. Every node here is additive, so none of it
blocks 1.2.0. 1.2.0 still carries the demo editor sign-off and open P2
Light-test bugs.

**1.2.0: the API sentence and two nodes.**

- **The API sentence** on unknown node and port types.
- **Recipes captured** here. How they ship is Aurora-4g4d.
- **`trigger.envelope`** (Aurora-q66y), Trigger to Float with attack, hold and
  decay params. One node covers flash, hit-and-decay and hold from group 1. It
  replaces the separate `trigger.flash` and hold entries in
  [[node-graph-pipeline]].
- **`math.step`** (Aurora-h87j), Float to Float 0 or 1 with a threshold and
  hysteresis band. Fixes the flicker in the loudness switch. See "Step versus
  Bool" below for why its Float output is permanent.

**1.2.1: more nodes, no new port type.**

- **`math.change`** (Float to Trigger), firing when a value jumps by more than
  a threshold. Covers drops and scene cuts. Trigger is the right type for an
  event, so this is also safe from retyping.
- **`image.mean`** (Image to Color), possibly as the `image.reduce` already in
  [[node-graph-pipeline]]. With `color.brightness` it covers dark scene
  dimming, one color from the whole screen, and the screen as an accent color.
  It averages every pixel of the rescaled image, so the answer does not depend
  on the zone layout.
- Lower than `image.mean`: **`frame.average`** (Frame to Color). It averages
  zone colors, one vote per zone, covering only what zones cover, so it suits
  Frames that did not come from a picture (a generated sweep, an audio color)
  rather than the screen.
- Editor converter insertion for unambiguous pairs (Color to Frame through
  `frame.broadcast`), and refusal messages that name candidate nodes for
  ambiguous pairs.
- The recipes reference, in the form Aurora-4g4d picks.
- Lower priority: `color.invert`, `frame.invert`, `image.invert`, Color-level
  RGB split and combine, Color gain. Each has a workaround (hue shift 180, HSV,
  Frame-level mixing) but the direct node is easier to find.

**Later, with a design bead each.**

- Bool with compare, and, or and select, plus explicit Bool and Float
  converters. Readability more than reach, since Float 0 and 1 already switch.
- A clock or time of day source, once the WASM demo's answer is settled.
- Zone targeting and masked mixes (group 3), the largest missing class of
  effect and the largest design question.
- Image reducers, crop, UVs, planes and Split or Combine.
- Int and an AudioFeatures combine: no effect found that needs them yet.
- Per-pixel `image.map`, only if users ask.

### Step versus Bool

`math.step` is a math function, like GLSL `step` and `smoothstep`: its contract
is "a number that is 0 below the edge and 1 above it". It feeds Float inputs
such as a mix node's `t` or a `math.multiply`, which is how it gets used. When
Bool lands, the comparison family (`compare`, and, or, select) is a separate
set of nodes whose natural output is Bool, with explicit `bool.toFloat` and
`float.toBool` converters between the two worlds. `math.step` stays as it is.

The trap is different: shipping a node whose job is a yes or no answer (a
`float.threshold` or `compare`) with a Float or Trigger output as a stand-in,
then changing that output to Bool. That changes an existing port's type and
breaks saved graphs. Naming and describing the node as math keeps it out of
that trap. The cost is some overlap once Bool exists (`step` versus `compare`
then `bool.toFloat`), which is acceptable because `step` carries hysteresis
and saves a converter in the common case.

## Open questions

- Plane as a new port type, or an Image with one channel and a float format?
- Does Int earn a port type, or stay a Float display mode?
- Which form should the recipes reference take, and who is it for first: users
  in the editor or agents over MCP? (Aurora-4g4d)
- How should a graph name a zone so that a targeted effect survives another
  room's layout?
