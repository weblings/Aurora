# Huenicorn pipeline scan

Initial look at the huenicorn repo, focused on two questions: whether the video
input can be swapped without breaking downstream code, and whether the color
calculation / storage / transport is Hue-specific.

## 1. Is the pipeline decoupled from the Linux video input?

Yes. The capture boundary is a real interface, not something wired to Linux
specifics.

- [`IGrabber`](huenicorn/include/Huenicorn/Grabber/IGrabber.hpp) is an
  abstract base (`name()`, `displayResolution()`, `displayRefreshRate()`,
  `grabFrameSubsample()`) with no X11/Wayland assumptions baked in.
- Three concrete grabbers exist under `src/Grabber/GnuLinux/`:
  [PipewireGrabber](huenicorn/src/Grabber/GnuLinux/Pipewire/PipewireGrabber.cpp),
  [X11Grabber](huenicorn/src/Grabber/GnuLinux/X11/X11Grabber.cpp), plus a
  synthetic [DummyGrabber](huenicorn/src/Grabber/DummyGrabber.cpp) that emits
  an animated solid color with no screen access at all — proof the rest of
  the pipeline doesn't care where frames come from.
- Grabber selection is runtime-dispatched per OS session type via
  [`IAdapter::getGrabber`](huenicorn/include/Huenicorn/Platform/IAdapter.hpp)
  /
  [`GnuLinuxAdapter::_createGrabber`](huenicorn/src/Platform/Adapters/GnuLinux/GnuLinuxAdapter.cpp),
  with graceful fallback to `DummyGrabber` on failure.
- [WindowsAdapter](huenicorn/src/Platform/Adapters/Windows/WindowsAdapter.cpp)
  and
  [MacOSAdapter](huenicorn/src/Platform/Adapters/MacOS/MacOSAdapter.mm)
  already exist as stubs (`_createGrabber` returns `nullptr`) — the seam for
  other platforms is scaffolded but unimplemented, not architecturally
  missing.
- Everything below capture —
  [`Runtime::_update()`](huenicorn/src/Core/Runtime.cpp#L266-L345),
  `ImageProcessing::rescale/getSubImage/getDominantColor` — operates purely
  on the generic
  [`ImageData`](huenicorn/include/Huenicorn/Imaging/ImageData.hpp) struct
  (`cv::Mat` + a `PixelFormat` enum). None of it references "screen,"
  "monitor," or a platform API.

**Caveat:** `PixelFormat` is only partially honored.
[`ImageProcessing::Algorithms::mean`](huenicorn/src/Imaging/ImageProcessing.cpp#L87-L98)
hardcodes a BGR channel swap regardless of the tag, and only RGBA→RGB is
converted upstream. A new grabber that reports true `RGB` (not `BGR`) would
get silently mis-colored. A drop-in source is safe today only if it emits
`BGR`/`BGRA` (OpenCV's native order), same as the existing grabbers do.

### Follow-up: could Windows / Android / Web / any video stream connect instead?

Theoretically yes at the `IGrabber` boundary, but the amount of *new* work
varies a lot by target:

- **Windows** — closest to done. `WindowsAdapter` already implements
  everything except the grabber. Someone would write a real grabber (e.g.
  DXGI Desktop Duplication) that fills `ImageData` with BGR/BGRA frames —
  nothing downstream changes.
- **Any file/network video source** (video file, RTSP/IP camera, virtual
  webcam) — the easiest real retrofit. `DummyGrabber` is effectively a toy
  version of this pattern already: implement `IGrabber`, decode frames into
  a `cv::Mat`, tag the `PixelFormat`, done.
- **Android** — no adapter exists at all today.
  [`Platform::Selector.hpp`](huenicorn/include/Huenicorn/Platform/Selector.hpp)
  picks exactly one `Adapter` type at **compile time** via
  `#ifdef __linux__ / __APPLE__ / WIN32` — there's no runtime plugin system,
  so a new OS target means extending that macro dispatch and building a new
  target, not a config change. All of `IAdapter` would need implementing
  (config path, username, browser-launch), not just the grabber, since
  those are bundled into one interface. Android's app model (no "spawn a
  browser to a localhost REST server" flow, background-service lifecycle)
  means more than the grabber would need rethinking.
- **Web (browser tab capture / `getDisplayMedia`)** — the biggest gap.
  Huenicorn is a native C++ daemon; there's no existing "receive a video
  stream over the network into the process" grabber. It's pluggable in
  principle at the `ImageData` boundary (decode incoming frames, wrap as
  `ImageData`), but that decode/ingest path doesn't exist yet — new code,
  not a swap of an existing OS API the way Windows capture would be.

Structural caveat that applies to all of these: `IGrabber`'s contract is
still shaped like "screen capture" (`MonitorSelectionData`,
`selectMonitor`, `displayResolution`/`displayRefreshRate` as monitor
concepts). A video file or camera can satisfy it (resolution = frame size,
refresh rate = fps, one dummy "monitor" entry), but it's a screen-capture
interface being reused for other sources, not a purpose-built generic
video-source interface.

## 2. Is the color calc / storage / transport Hue-specific?

Yes, extensively. Capture and cropping are generic; everything from the
color transform onward is Hue-locked.

- [`Color::toXYB()`](huenicorn/include/Huenicorn/Imaging/Color.hpp#L90-L132)
  implements Philips' proprietary CIE xyY gamut conversion (the "Wide RGB
  D65" formula) — the exact color space Hue bulbs consume, not a generic
  RGB/HSV transform.
- The data model is Hue-shaped throughout:
  [`Hue::Api::Channel`](huenicorn/include/Huenicorn/Hue/Api/Channel.hpp)
  carries `gammaFactor`, `Devices`, and `uvs`, explicitly commented as
  "matching Hue streaming protocol"; `ChannelStream` holds `r/g/b` that are
  actually x/y/brightness.
- The wire format is a literal implementation of Hue's binary "HueStream"
  v2 entertainment protocol:
  [`HuestreamHeader`](huenicorn/include/Huenicorn/Stream/HuestreamHeader.hpp)
  has the `"HueStream"` magic bytes, a `colorSpace` flag, and a 36-byte
  `entertainmentConfigurationId`;
  [`HuestreamPayload`](huenicorn/include/Huenicorn/Stream/HuestreamPayload.hpp)
  packs per-channel 16-bit fields.
- [`Streamer`](huenicorn/src/Stream/Streamer.cpp) sends that buffer over
  DTLS to port `2100` with hostname `"Hue"` — Hue Bridge's specific
  entertainment-streaming endpoint.
- Setup/config (`Hue::Api::ApiTools`, `BridgeAddress`,
  `EntertainmentConfigurationSelector`, `Credentials`/`clientkey`) all speak
  Hue's REST bridge-pairing API directly.

### Follow-up: where would the pipeline fork for a non-Hue bulb?

Reusable, target-agnostic part stays exactly as-is: `IGrabber` →
`ImageData` → `ImageProcessing::rescale/getSubImage/getDominantColor` →
`Imaging::Color` (raw RGB + generic `toNormalized()`/`brightness()`).

The fork happens where that `Color` gets consumed, in
[`Runtime::_update()`](huenicorn/src/Core/Runtime.cpp#L307-L336):

- **Color transform** — the call to `color.toXYB()` is the first
  Hue-specific line. A non-Hue bulb (WLED, LIFX, Art-Net/sACN, etc.) wants
  plain RGB or HSV, not CIE xyY, so this is the literal branch point. Gamma
  correction as a concept is generic; only the CIE gamut math is Hue's.
- **Data model** — `Hue::Api::Channel` / `ChannelStream` / `Devices` are
  shaped around Hue Bridge entertainment areas (channel id, member devices,
  per-channel gamma). The concept of "screen region → dominant color →
  assign to a zone" is generic and worth keeping, but the struct itself
  would need a parallel, ecosystem-specific equivalent rather than reuse.
- **Transport** — `Streamer` + `HuestreamHeader`/`HuestreamPayload` +
  `DtlsClient` (DTLS/UDP, Hue's binary framing, `entertainmentConfigurationId`)
  would be replaced wholesale — e.g. WLED's UDP DRGB/DNRGB packets are
  plaintext, LIFX has its own LAN UDP protocol, sACN is yet another packet
  format. Note: unlike `IGrabber`, there is **no `IStreamer` interface
  today** — `Runtime` holds a concrete `std::unique_ptr<Stream::Streamer>`
  directly. The output side isn't already set up for polymorphic swapping
  the way input is; supporting a second target means introducing that
  abstraction first, not just implementing a new subclass.
- **Discovery/auth** — `Hue::Api::ApiTools`, `BridgeAddress`,
  `EntertainmentConfigurationSelector`, `Credentials` all speak Hue's
  bridge-pairing REST flow (press-link-button registration, entertainment
  config listing). A different ecosystem needs its own pairing/discovery
  (or none, if the target has no auth).
- **Profile schema / WebUI** — the JSON profile format
  (`Serialization::Channel.hpp`) and setup pages (`webroot/setup.html`,
  `mainSetup.js`) are written in terms of `entertainmentConfigurationId` and
  Hue bridge pairing, so those would need ecosystem-specific counterparts
  too.

So the fork line is: everything through `Imaging::Color` is reusable; the
`toXYB()` call onward — plus the whole `Hue::Api` namespace and `Stream`
namespace — is what gets replaced for a different bulb ecosystem.
