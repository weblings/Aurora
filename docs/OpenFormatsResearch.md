# Existing open formats for video/audio-reactive lighting

Survey done while scoping the Processing module (see
[`ModuleSplitPlan.md`](ModuleSplitPlan.md)) — is there already a standard for
"analyze media, produce zone/color/effect data, send it to fixtures," so Aurora
isn't reinventing one?

See [`DistributedArchitecturePlan.md`](DistributedArchitecturePlan.md) for
how VJ I/O (NDI/Syphon/Spout, Art-Net/sACN/OSC) and authored-track playback
map onto Aurora's Input/Processing/Output boundaries if any of them end up
running over a network.

## Transport/output layer — yes, mature open standards exist

These solve "push per-zone color/intensity data to physical fixtures over a
network." This is what huenicorn's `Streamer`/`HuestreamPayload` already does,
just Hue-specific — good candidates for additional Output-module targets:

- **DMX512 / Art-Net / sACN (E1.31)** — the stage-lighting standard. Art-Net and
  sACN both wrap DMX universes over Ethernet; sACN is an ANSI standard with
  multi-source sync built in. [Open Lighting Architecture](https://www.openlighting.org/)
  is the open-source hub that already speaks both plus 20+ USB DMX dongles — a
  useful reference for structuring a "many backends, one core" output layer (this
  is effectively the `IOutput` idea in `ModuleSplitPlan.md`, already proven at
  scale).
- **Open Pixel Control / DDP / TPM2.net** — simpler "push an RGB array" protocols
  for addressable LED pixels (Fadecandy/OPC, WLED's preferred DDP, TPM2.net).
  Lower ceremony than DMX, closer to what a `ChannelStream`-shaped array already
  looks like.
- **Hue Entertainment API / WLED's own UDP modes** — proprietary-but-documented,
  ecosystem-specific (what huenicorn already speaks for Hue).
- **Hyperion / Boblight / LedFx** — the screen-capture-to-ambient-light projects
  closest to huenicorn in spirit. Each has its own JSON zone-layout config, but
  none of these are cross-project standards — they're per-project formats, same
  situation huenicorn is already in. Worth reading their configs for zone-layout
  UX ideas, not for a format to adopt.

## Processing-layer intermediate format — no standard exists

Nothing plays the role MIDI plays for notes, or DMX plays for stage lighting, for
"screen/audio analysis → zone color/effect over time." Every ambient-lighting
project invents its own internal shape.

The closest real precedent found: **xLights' XSQ/FSEQ pair** (Falcon Player
ecosystem, open source, mature). XSQ is the authored/editable sequence (effects
placed on models over time); FSEQ is the compiled, compressed channel-timeline
played back at showtime. That's a genuine open format for "timed lighting effects
synced to a media file" — but it's built for **pre-authored** shows synced to
known content, not live analysis of an arbitrary feed.

## Do any of these support per-frame color-positions + effects + detected-object AABBs?

Checked against the goal of authored sections lining up structurally with the live
API — meaning the real question isn't just "does a format exist" but "which
existing shape, if any, is close enough to fork." Compared four candidates
head-to-head instead of picking one on first impression:

| | Target/zone concept | Effect concept | Continuous-parameter curves | Live counterpart to the authored format? |
|---|---|---|---|---|
| **OpenSongChart** | `String`/`Fret` (guitar) or MIDI `Note` — a small **fixed enumeration** (6 strings, 88 keys), not a spatial region | `Techniques` bitmask — a **small fixed set** of note articulations (hammer-on, bend, palm mute, vibrato...), not open-ended | Yes — `CentsOffsets` on a note is a time-ordered curve (used for pitch bends). Structurally exactly "a continuous parameter animated within an event's time range." | **No.** Charts are always authored ahead of time against a known recording. ChartPlayer's "live" side is scoring — comparing detected input against a fixed precomputed chart — never generating new chart events from an unknown feed. |
| **xLights XSQ** | `Model` — an **arbitrary, author-defined spatial layout** (matrix, arch, star). Closer to a real "region" than a fixed index. | A real **effect library** — dozens of named, parameterized visual algorithms (chases, washes, video, text) — exactly "what should this region do." | Yes, via per-effect parameter curves/palettes over the effect's duration. | **Partially.** XSQ (authored) compiles to FSEQ (played back), so the ecosystem already treats "authored → real-time playback" as one pipeline — but FSEQ is fully rendered flat pixel data, not a live semantic event stream, and nothing in xLights *generates* XSQ from an unknown live feed. |
| **MIDI / MIDI Show Control** | MIDI channel + note number — a fixed 0–127 enumeration, plus MSC's "cue number" addressed at a device | MSC cues **trigger** a pre-programmed look on the receiving console by ID; the payload itself carries no color/effect data | Yes — MIDI CC messages are exactly "a continuous parameter curve over time" | Yes in principle (MSC is literally "control a lighting console live over MIDI"), but the actual cue content lives on the console, not in the protocol — it's a trigger protocol, same limitation as DMX. |
| **CV/ML detection formats** (COCO/VOC/YOLO) | Frame-indexed bounding box | None — zero lighting semantics | No | N/A — different domain entirely, no lighting counterpart exists |

None of these carry detected-object AABBs — that's foreign to every lighting/chart
format surveyed, unsurprising since it's a computer-vision concept, not a lighting
one.

**Revisiting OpenSongChart specifically, since it deserves more credit than the
first pass gave it:** its `String`/`Fret`/`Note` field really is structurally a
"target index" the same way a Hue `channelId` or an XSQ `Model` name is — it's
just drawn from a small fixed musical enumeration rather than an arbitrary spatial
region. Its `Techniques` bitmask really is an "effect modifier" on an event. Its
`CentsOffsets` curve is a genuinely good precedent for animating a parameter
smoothly within one event's duration (e.g. a color sweep during a single cue). So
the per-event shape — `{ time range, target, effect/technique flags, optional
continuous-parameter curve }` — is honestly about as close a match as XSQ's.

**Where OpenSongChart loses to XSQ for this specific use, on reflection:**

1. **Target shape.** A guitar has exactly 6 strings and a piano 88 fixed keys —
   `String`/`Note` is drawn from a small closed set matching a *physical
   instrument*. An XSQ `Model` is an arbitrary author-defined spatial layout,
   which is the shape a screen-region zone or a detected AABB actually needs
   (open-ended geometry, not a fixed small index). Forcing detected regions or
   flexible zone layouts into a "fret number"-shaped field would be a worse fit
   than into a "named spatial model" field.
2. **Effect richness.** `Techniques` is a closed bitmask of ~10 note articulations
   meant to describe *how a guitar note was physically played*, not an
   extensible "what visual pattern should this region show" vocabulary. XSQ's
   effect library is already built for that exact question.
3. **Live/authored parity — the deciding factor for this project.** OpenSongChart
   has no live-generation counterpart anywhere in its ecosystem; a chart is
   always precomputed from known content, never produced live from an
   unrecognized feed. That directly conflicts with Aurora's live-now
   requirement. XSQ's ecosystem already spans "authored" and "compiled for
   real-time playback" as two ends of one existing pipeline — closer in kind
   to what "authored sections line up with the live API" is asking for, even
   though FSEQ itself is too flattened to reuse directly.

So the call is XSQ over OpenSongChart specifically *because of the live/authored
parity requirement*, not because OpenSongChart's per-event shape is a bad
template — it's genuinely a close second, and its `CentsOffsets`-style continuous
curve is worth pulling in regardless of which base shape wins.

**Implication:** none of the four gets adopted wholesale — Aurora's per-tick
`Frame` type (referenced in `ModuleSplitPlan.md`'s `IOutput` section) has to be
designed from scratch, since nothing surveyed carries color-at-position, effect
metadata, and detection AABBs together, and nothing surveyed both authors ahead of
time and generates live from unknown content. The synthesized shape worth
building toward: `{ target: zone-or-region (XSQ-shaped, arbitrary layout, not a
fixed index), kind: color | effect | detection, params, timeRange, optional
continuous-parameter curve (OpenSongChart's CentsOffsets pattern) }`. An authored
section then becomes literally a recorded/edited sequence of the same objects the
live pipeline emits per tick.

## Integrating YOLO-style object detection

Object-detection model output (YOLO or otherwise) is a different kind of data than
anything above — worth working out where it enters the pipeline and what shape it
takes, since it changes both Processing and, downstream, what Output can do.

**What the output actually is.** Training/dataset formats (COCO JSON, Pascal VOC,
YOLO's per-image `.txt`) all describe the same underlying facts — class label,
confidence, bounding box — but they're snapshot/dataset formats, not something a
live pipeline streams frame-to-frame. Two real precedents for the *live streaming*
version of the same data:

- **[ONVIF Profile M](https://www.onvif.org/specs/2206/Analytics.html)** — a
  genuine ratified open standard, already shipping across IP-camera/NVR vendors.
  Bounding boxes, class labels, and simple attributes are serialized as an XML
  "Scene Description," in **normalized coordinates**, streamed as
  `VND.ONVIF.METADATA` over RTP alongside the video itself. This is the real
  "detection metadata traveling with a video stream, as an open standard" answer.
- **[Frigate NVR](https://github.com/blakeblackshear/frigate)** — open source, not
  a formal standard, but a mature, widely-deployed real implementation of local
  object detection on camera feeds. Its MQTT event schema treats a detection as a
  **stateful, persistent thing**: one message when a tracked object first appears,
  further messages as it updates (better snapshot, zone change), a final message
  with `end_time` when it's gone — not a fresh unrelated blob every frame. That
  lifecycle shape is the right thing to copy, independent of MQTT itself.

**Where it plugs into Aurora:**

- Detection is a **Processing-stage concern**, not Input's. Input stays
  pixels-only (`ImageData`) so it stays source-agnostic; a detector (YOLO or
  otherwise) is one analyzer *inside* Processing that consumes `ImageData` and
  produces detections, alongside (or instead of) the existing crop+dominant-color
  analyzer. The alternative — a "smart camera" that emits ONVIF-style detection
  metadata itself instead of raw pixels, so Processing never has to run a model at
  all — is worth flagging as a future fork (does Input ever carry more than
  pixels?) rather than deciding now.
- huenicorn's existing `Imaging::UVs { min, max }` (already a normalized 0–1
  bounding box, used for hand-authored channel zones) is already the exact shape a
  detection bbox needs — detections and manually-drawn zones can share one type,
  no new geometry needed.
- **Cadence mismatch is real.** Color-sampling is cheap enough to run every tick;
  a detection model realistically isn't. `Runtime::_update()` already tolerates a
  grabber producing no fresh frame yet (`if(!m_frameData.hasData()) return;`) —
  Processing needs the same tolerance for "detections are one or more ticks
  stale," not an assumption that a detection exists fresh every tick.
- **Track identity matters for lighting** the same way huenicorn's existing
  `transitionSmoothing`/`previousXyb` per-channel smoothing already matters for
  color — an object flickering between detected/undetected, or swapping IDs
  frame-to-frame, would strobe whatever effect is anchored to it. Frigate's
  persistent-id-until-`end_time` model is the pattern to copy, not a stateless
  per-frame detection list.
- **Output implication:** a physical Hue channel or DMX fixture can't "be at a
  screen position," but an XR effect anchored in camera space absolutely can —
  object detection is the piece that makes the stated "effects around video
  players in XR" Output target genuinely differentiated from bulb-output, and
  reinforces that the Processing→Output `Frame` type needs a `kind: detection`
  variant (bbox + class + track id), as sketched earlier in this document.

## Open source VJ/video-remixing software and formats

Checked whether the VJ/live-visuals world has already solved pieces of this — it
has, and some of it maps better to Aurora's Output goals (effects around video,
in XR) than the theatrical-lighting formats above do.

- **[ISF — Interactive Shader Format](https://github.com/vidvox/isf)** — the
  strongest find here. A real open spec (VIDVOX, 2013, now v2.0): an ISF file is a
  GLSL fragment shader with a JSON header declaring typed inputs (float, color,
  image, point2D, audio/FFT, event) and how to render them. It's genuinely
  cross-tool — adopted by VDMX, Resolume, Magic Music Visuals, Vuo, and a shared
  library of hundreds of free, open shaders at [isf.video](https://isf.video/).
  This is a real "portable, parameterized visual effect" format the VJ community
  already solved, and it fits **"effects around video players in XR"** far better
  than DMX/xLights do — it's built for GPU shader effects on/around imagery, not
  physical fixtures. Concretely: an ISF-driven Output target could take
  Processing's per-tick data (a color, a position, an intensity) and map it onto
  an existing ISF shader's declared inputs, getting an entire existing effect
  library for free instead of hand-writing every XR visual. Worth shaping the
  Processing→Output `Frame`/params so its fields are nameable/mappable onto ISF's
  typed-input model.
- **Spout (Windows) / Syphon (macOS)** — both open source, GPU-accelerated,
  zero-copy texture sharing between applications on the same machine — the VJ
  world's actual answer to "get a live frame from one app into another." A
  `SpoutGrabber`/`SyphonGrabber` implementing `IGrabber` would let Aurora receive
  a feed from literally any VJ tool, game engine, or another Aurora instance,
  with no screen-capture API involved at all — arguably a better "any 2D input"
  story for a meaningful chunk of use cases than platform screen capture, and a
  much smaller lift than a first-party Android/Web capture backend.
- **NDI (Network Device Interface)** — free SDK (not fully open source, but
  ubiquitous and cross-platform: Windows/Mac/Linux/mobile), the network
  equivalent of Spout/Syphon for streaming video between machines at low latency.
  Same Input-module relevance, across a LAN instead of within one machine.
- **OSC (Open Sound Control)** — mature, simple, widely-adopted UDP protocol for
  streaming named/typed parameters live; the actual glue VJ software, lighting,
  audio tools, TouchDesigner, and game engines already use to talk to each other.
  A lighter-weight option than DMX for the parameter-style data crossing the
  Processing→Output boundary (or Output→console), and commonly already supported
  by XR/game engines — another point in favor of the XR-effects Output target
  being genuinely reachable, not speculative.
- **No standardized VJ project/composition format exists** — Resolume's `.avc`,
  VDMX's format, TouchDesigner's `.toe` are all proprietary and app-specific, the
  same situation as lighting show files (`ImplementationPlan.md`'s xLights
  finding). ISF only standardized the narrow "one shader + its declared
  parameters" unit — that narrowness is exactly why it succeeded as a cross-tool
  standard where whole-composition formats never did. Worth taking as a lesson
  for Aurora's own authored-format ambitions: keep the authored *event/effect*
  unit narrow and standardizable, don't try to standardize an entire "show."

## Conclusion for Aurora

- **Live-reactive mode** (chosen as the near-term target — see
  `ModuleSplitPlan.md`): no file format needed. Processing emits an in-memory,
  per-tick "zone → color/intensity" struct each frame, same role
  `Hue::Api::ChannelStream` plays today, just made output-agnostic.
- **Output targets**: DMX/Art-Net/sACN and OPC/DDP for physical fixtures; **ISF**
  specifically for the XR/video-effects target, since it fits that use case
  better than anything lighting-specific; OSC as a lightweight live
  parameter-transport option. All real, standard, worth targeting as `IOutput`
  adapters alongside Hue.
- **Input sources beyond screen capture**: Spout/Syphon (same-machine
  GPU texture sharing) and NDI (networked) are concrete, low-lift `IGrabber`
  candidates that plug Aurora into the existing VJ/creative-coding tool
  ecosystem directly.
- **Object detection**: a Processing-stage analyzer, not an Input concern;
  reuse `Imaging::UVs` for bounding boxes; model its lifecycle on Frigate's
  persistent-id-until-`end_time` pattern rather than stateless per-frame blobs;
  budget for detections updating slower than raw frames.
- **Authored-sequence mode** (stretch/later): borrow XSQ's arbitrary-region
  `Model` concept and authored→compiled pipeline shape, OpenSongChart's
  continuous-parameter-curve (`CentsOffsets`) pattern for animating within one
  event, and ISF's lesson to standardize only the narrow effect unit, not a
  whole "show" — not any one format wholesale.
