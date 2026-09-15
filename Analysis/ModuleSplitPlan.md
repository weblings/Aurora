# Splitting huenicorn into Input / Processing / Output

Goal: take huenicorn's monolithic "grab Linux screen → dominant-color-per-region →
stream to Hue bridge" pipeline and split it into three modules with a
platform-agnostic core in the middle. See [`FirstScan.md`](FirstScan.md) for the
original pipeline read that this plan builds on.

These boundaries are also where a future network seam would go if any
module ends up running on a separate device — see
[`DistributedArchitecturePlan.md`](DistributedArchitecturePlan.md) for that
open question (not resolved, doesn't block anything built so far).

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

## `IOutput` and `Contracts::Frame` — built

The payload question is resolved for v1: `Contracts::Frame` is `std::vector<Zone>`,
`Zone` is `{ uint8_t id; Contracts::Color color; }` — generic linear color, no
target-specific transform baked in. Naming/placement correction made while
actually porting Hue (see `HueOutputAnalysis.md`): this was called
`Processing::Frame` earlier in this doc; it belongs in **`Contracts`**, not
`Processing`, for the same reason `ImageData` does — it's a boundary type, not
Processing's own logic. Richer fields (positions, effect metadata, detections —
`OpenFormatsResearch.md`) extend `Zone` later without changing this shape's role.

`IOutput` (`Aurora/core/Output/IOutput.hpp`, header-only interface target
`AuroraOutputInterface`) dropped the `Core::Config*` constructor param the first
draft mirrored from `IGrabber` — checking `Streamer`'s actual constructor
(`Credentials` + `bridgeAddress`) showed target addressing is always
plugin-specific, never generic config, so it doesn't belong on the base class
at all:

```cpp
class IOutput
{
public:
  virtual ~IOutput() = default;
  virtual const std::string& name() const = 0;
  virtual void init() = 0;
  virtual bool isConnected() const = 0;
  virtual void shutdown() = 0;
  virtual void send(const Contracts::Frame& frame) = 0;
};
```

Still true, from how `Streamer` behaves, and still not yet acted on:

- **Push, not pull** — the opposite of `IInput` (the app pulls frames from
  Input, pushes results to Output).
- **Target capability negotiation is needed** — Hue's entertainment-config
  selection is the Output-side analog of `IInput`'s monitor selection; some
  targets need a discovery/pairing step before `send()` works, some don't.
  `IOutput` needs an optional pre-`init()` negotiation phase, not mandatory.
- **Fallback behavior** — a `DummyOutput`/no-op sink (mirroring `DummyGrabber`)
  isn't built yet; still worth doing for the same reason (inspect Processing's
  output with no bridge/fixture reachable).

## Repo split (2026-09-13)

Plugins (Input and Output implementations) live in their **own repos**, not
inside Aurora core, decided once a real dependency-bloat concern came up: a
Linux capture plugin needs `pipewire`/`libX11` dev packages, a Hue output
plugin needs `mbedtls`/`CURL` for DTLS+REST — neither should be a precondition
for building Aurora core or an unrelated plugin.

**What actually achieves what, worked out carefully since it's easy to
conflate these:**
- Repo separation + dependency isolation: **yes**, cleanly — each plugin repo
  declares only its own dependencies, `FetchContent`-pulled into a future
  app build only if that plugin is enabled.
- Repo separation → license independence between plugins in the *same
  compiled binary*: **no** — GPLv3's reach is about the combined work as
  linked/run together, not which repo the source sits in. A build that links
  `Aurora-Output-Hue` (GPLv3, huenicorn-derived) in is a GPLv3 binary
  regardless of repo layout. A build that never enables/fetches it isn't
  encumbered by it at all — that's real, but it's a per-*build* effect of
  optional linking, not a per-*repo* one.
- Genuine license independence for one plugin from another requires them to
  run as **separate processes** communicating over an interface (sockets,
  HTTP), not just separate repos or separate `.so`/`.dll` files still loaded
  into one running program. `Aurora-Demo-Web` (2026-09-14, split into its own
  repo — see `ImplementationPlan.md`'s Phase 3) already qualifies, by
  accident of its architecture (a browser tab, not a linked binary) —
  `core`-linked plugins don't.

**Structure**: Aurora core exposes only `Contracts` + header-only
`AuroraInputInterface`/`AuroraOutputInterface` targets. Each plugin repo
(`Aurora-Input-Linux`, `Aurora-Output-Hue`, future ones) is its own standalone,
independently buildable/testable CMake project, consuming Aurora core via
`FetchContent` (`SOURCE_DIR` to a local sibling path for now; swap for
`GIT_REPOSITORY`+`GIT_TAG` once Aurora core has a real remote). A future
top-level app assembles whichever plugins are wanted via `option()`-gated
`FetchContent` calls — not built yet, since `Core::Config`/`Runtime` haven't
been ported to Aurora at all yet (that's what would actually link plugins
together).

**A related finding, deferred rather than fixed**: `AuroraContracts` bundles
`ImageData` (needs OpenCV) together with `Color`/`UV`/`Interpolation` (don't)
in one library with a blanket `PUBLIC` OpenCV link — so today, *any* consumer
of `Contracts`, including an Output plugin that never touches a `cv::Mat`,
is forced to have OpenCV installed. `Aurora-Output-Hue` hits this now (needs
OpenCV solely because it depends on `Contracts` for `Color`). Splitting
`Contracts` further (an OpenCV-free core + an `ImageData`-specific piece)
would fix this properly; not done this pass, recorded here so it doesn't get
forgotten now that a real plugin has actually hit it.

## Other open questions / follow-ups

- Audio input/processing is an explicit stretch goal — confirmed huenicorn has
  **no existing audio code at all** (no directory, no library, nothing under
  `Config`) — grepped the whole tree for `audio`/`mic`/`pulse`/`alsa`/`wasapi` and
  found nothing real. This is greenfield, not an extension of something partial.
  Would enter through its own Input-like seam rather than being bolted onto the
  video path, since audio and video are independent capture sources that a shared
  Processing stage could fuse.

See [`StackComparison.md`](StackComparison.md) for how this split's `IInput`
seam actually looks in practice once two real platforms exist behind it —
huenicorn vs. Aurora-App-Linux vs. Aurora-App-Windows, with the data flow
and dependency-library roles at each step.
