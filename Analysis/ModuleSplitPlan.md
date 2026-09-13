# Splitting huenicorn into Input / Processing / Output

Goal: take huenicorn's monolithic "grab Linux screen → dominant-color-per-region →
stream to Hue bridge" pipeline and split it into three modules with a
platform-agnostic core in the middle. See [`FirstScan.md`](FirstScan.md) for the
original pipeline read that this plan builds on.

- **Input** — any 2D video source (screen, file, camera, eventually
  Windows/Android/Web). Platform-specific by nature.
- **Processing** — turns frames into effect/color data. Platform-agnostic. Room to
  grow past "crop a region and average it."
- **Output** — sends effect/color data to a target (Hue today; other bulbs, DMX/LED
  rigs, or XR-scene effects later). Target-specific by nature.

Decision (2026-09-12, both live-now / authored-later chosen — see
[`OpenFormatsResearch.md`](OpenFormatsResearch.md) for the format survey behind
this): Processing is designed **live-reactive first** — it reacts frame-by-frame to
whatever the Input module hands it, no precomputed file format required. The
per-tick contract between modules should stay generic enough that an *authored*
sequence (a saved/edited timeline for known content, xLights-XSQ-style) could later
be represented as a recorded/edited stream of the same per-tick events, without a
redesign. Authoring tooling itself is out of scope for now.

## Mapping huenicorn's current code to the new modules

| New module | Current huenicorn pieces | Notes |
|---|---|---|
| Input | `Grabber::IGrabber` + `DummyGrabber`/`PipewireGrabber`/`X11Grabber`, `Platform::IAdapter`/`Selector`, `Imaging::ImageData`/`PixelFormat` | Already the cleanest seam in the codebase — see `FirstScan.md` Q1. `PixelFormat` needs to become fully honored (today `ImageProcessing::Algorithms::mean` hardcodes BGR regardless of the tag) before Input can safely feed non-BGR sources. Beyond platform screen capture: Spout/Syphon (same-machine GPU texture sharing) and NDI (networked) are concrete low-lift `IGrabber` candidates — see `OpenFormatsResearch.md`'s VJ-software section. |
| Processing | `Imaging::ImageProcessing` (rescale/getSubImage/getDominantColor), `Imaging::Color` up through `toNormalized()`/`brightness()`, the per-channel loop in `Runtime::_update()` | `Color::toXYB()` is the current hard stop — it's Hue's CIE xyY math, not generic; moves to Output (see Decisions below). Needs to become one pluggable transform among several. This is also where new analysis (motion, edges, multiple sample points, beat-synced effects, and object detection — see `OpenFormatsResearch.md`'s YOLO-integration section) would plug in. `Imaging::UVs` already doubles as the right bounding-box type for detections, not just hand-authored zones. |
| Output | `Hue::Api::Channel`/`ChannelStream`/`Devices`/`EntertainmentConfiguration*`, `Stream::Streamer`/`HuestreamHeader`/`HuestreamPayload`/`DtlsClient`, `Hue::Api::ApiTools`/`BridgeAddress`/`Credentials` | All Hue-Bridge-shaped today (see `FirstScan.md` Q2). Unlike Input, there is **no output-side interface** yet (`Runtime` holds a concrete `Stream::Streamer`) — an `IOutput`/`ISink` abstraction analogous to `IGrabber` needs to be introduced before a second target (another bulb brand, DMX/Art-Net/sACN, ISF-driven XR effects, an XR-scene effect channel) can coexist with Hue. See `OpenFormatsResearch.md` — ISF fits the XR-effects target better than any lighting-specific format. |

## The middle contract (Input → Processing → Output)

**Update from actually porting Processing** (see `ProcessingAnalysis.md`): the
three-module picture above didn't say where the shared types crossing these
boundaries physically live. They can't live inside `Processing` itself — every
`IInput` implementation would then need to link against `Processing`'s logic
just to know the shape of the struct it fills in, a backwards dependency. So a
fourth piece exists now: **`Contracts`** — a small library holding only the
neutral types (`ImageData`, `PixelFormat`, `UV`/`UVs`, `Color`'s generic parts,
`Interpolation::Type`), no transform logic. `Input` and `Output` implementations
depend on `Contracts` directly; `Processing` depends on `Contracts` and adds the
logic. This has already been built (`Aurora/core/Contracts/`,
`Aurora/core/Processing/`) — the table below still lists Input/Processing/Output
as the three *logical* modules since that's the boundary that matters for
swapping implementations; `Contracts` is the shared foundation underneath all
three, not a fourth swappable thing.

Today's per-tick data that crosses module boundaries, generalized:

- Input → Processing: `Contracts::ImageData` (already generic: `cv::Mat` +
  `PixelFormat`). Stays as-is — ported unchanged into `Contracts`.
- Processing → Output: today this is `Hue::Api::ChannelStream` (`id`, `r/g/b` that are
  secretly x/y/brightness). Needs a neutral replacement — something like a "zone"
  keyed by an opaque ID with a color/intensity value in a documented, output-agnostic
  space (plain normalized RGB is the obvious default; a target-specific transform,
  e.g. `toXYB()` for Hue, moves into the Output module next to the Streamer that
  needs it).
- The zone concept itself (`Contracts::UVs` cropping a screen region, `gammaFactor`)
  is generic and worth keeping in Processing rather than Output.

## Decisions (2026-09-12)

- **Gamma lives in Output, not Processing.** Each target gamma-corrects its own way
  (huenicorn's current `Channel::gammaExponent()` + `glm::pow` on the xyY brightness
  channel is itself a Hue-shaped choice — DMX fixtures, LED strips, and XR-scene
  lights each have their own correction needs). Processing hands Output linear
  color; Output applies whatever correction its target needs before transmitting.
  A universal override (a single knob that pre-adjusts before any per-target
  correction) is deferred until a concrete second target shows it's actually
  needed — no target-agnostic gamma exists yet to design around.

## `IOutput` — draft shape

Mirrors `IGrabber`'s pattern (see `FirstScan.md`), but one piece has to stay a
placeholder: **the type of the per-tick payload Output consumes is the same type
Processing produces, and that type isn't decided yet** (see
`OpenFormatsResearch.md`'s per-frame-shape section — it's larger than the current
`ChannelStream` r/g/b triple once positions/effects/detections are in scope). What
*can* be pinned down now, independent of that payload:

```cpp
class IOutput
{
public:
  IOutput(Core::Config* config);
  virtual ~IOutput();

  virtual const std::string& name() const = 0;

  // Connection lifecycle — mirrors DtlsClient::init()/Streamer's constructor today.
  // Target addressing/credentials (bridge address + username, a DMX universe +
  // node IP, ...) are target-specific, passed to the concrete subclass's
  // constructor the same way Streamer takes Credentials + bridgeAddress now.
  virtual void init() = 0;
  virtual bool isConnected() const = 0;
  virtual void shutdown() = 0;

  // Push model — Runtime calls this once per tick, same as
  // Streamer::streamChannels() today. Payload type TBD.
  virtual void send(const Processing::Frame& frame) = 0;

protected:
  Core::Config* m_config;
};
```

Also known regardless of payload shape, from how `Streamer` already behaves:

- **Push, not pull** — the opposite of `IGrabber` (Runtime pulls frames from Input,
  but pushes results to Output). No change needed there.
- **Target capability negotiation is needed.** Hue's "pick an entertainment
  configuration, then its channels" step
  (`EntertainmentConfigurationSelector`/`setEntertainmentConfigurationId`) is the
  Output-side analog of `IGrabber`'s monitor selection — some targets need a
  discovery/pairing step before `send()` works, some (a bare DMX universe) don't.
  `IOutput` needs an optional pre-`init()` negotiation phase, not a mandatory one.
- **Fallback behavior** — `IAdapter::getGrabber`'s catch-and-fall-back-to-DummyGrabber
  pattern is worth mirroring with a `DummyOutput`/no-op sink for the same reasons
  (lets Processing run and be inspected with no bridge/fixture reachable).

What's genuinely blocked on the payload decision: the `send()` signature itself,
and therefore how much of `Hue::Api::ChannelStream`'s shape (a flat id+color per
zone) versus a richer per-tick `Frame` (positions, effect metadata, detections —
see `OpenFormatsResearch.md`) `IOutput` needs to expose to every target, including
ones (DMX) that can't represent most of that richness anyway.

## Other open questions / follow-ups

- Audio input/processing is an explicit stretch goal — confirmed huenicorn has
  **no existing audio code at all** (no directory, no library, nothing under
  `Config`) — grepped the whole tree for `audio`/`mic`/`pulse`/`alsa`/`wasapi` and
  found nothing real. This is greenfield, not an extension of something partial.
  Would enter through its own Input-like seam rather than being bolted onto the
  video path, since audio and video are independent capture sources that a shared
  Processing stage could fuse.
