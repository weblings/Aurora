# Stack comparison — huenicorn vs. Aurora-App-Linux vs. Aurora-App-Windows

Captures the architecture actually built so far, grounded against huenicorn
as a starting comparison, with a focus on two things: how data physically
moves through each stack, and which dependency library is doing the
interpreting/transporting at each step. Diagrams show one tick's worth of
data, capture through bridge; the `why` behind the module split itself is
covered in `ModuleSplitPlan.md`/`RuntimeAnalysis.md`, not repeated here.

## 1. huenicorn — one process, one thread, one of everything

Verified against the actual source (`Core/Runtime.hpp`): one `IGrabber*`
(compile-time-selected adapter), one `Stream::Streamer`, `Hue::Api::Channels`
embedded directly as `Runtime` members (not behind a generic output
interface), all driven by a single `_update()` call inside
`_startStreamingLoop()`'s own thread. The web UI (`httplib`) runs on a
second thread purely for setup, not part of the streaming data path.

```mermaid
graph LR
  A["X11/Wayland capture<br/>(Platform::Selector, compile-time —<br/>Windows never worked: WindowsAdapter::_createGrabber<br/>returns nullptr, verified in source)"] -->|raw framebuffer bytes| B["Imaging::ImageData<br/>(cv::Mat + PixelFormat)"]
  B --> C["ImageProcessing::rescale"]
  C --> D["getSubImage per channel<br/>(UV rect crop)"]
  D --> E["getDominantColor<br/>(pixel average)"]
  E --> F["Color::toXYB + gammaExponent<br/>(Hue colorimetry)"]
  F --> G["HuestreamHeader/Payload<br/>(byte packing)"]
  G --> H["DtlsClient<br/>(Mbed TLS encrypt)"]
  H --> I["UDP :2100 → Hue bridge"]
```

**Libraries doing the interpreting:**
- **OpenCV** (`cv::Mat`) — the in-memory image representation from capture
  through cropping/averaging; `PixelFormat` is huenicorn's own tag riding
  alongside it, since `cv::Mat` itself doesn't encode channel order.
- **glm** — `vec2`/`ivec2` for UV rects and resolutions; pure math, doesn't
  touch raw bytes.
- **nlohmann::json** — reads/writes `config.json`/profile JSON directly
  inline in `Core::Config`/`Runtime`, no dedicated store class.
- **libcurl** — HTTPS to the CLIP v2 REST API (bridge discovery,
  entertainment config lookup) — its own TLS backend, unrelated to Mbed TLS.
- **Mbed TLS** — the DTLS-PSK handshake and encryption for the binary
  HueStream v2 protocol, UDP port 2100 — a second, independent TLS stack
  from curl's, for a different protocol on a different port.
- **X11/Xext/Xrandr**, or **libpipewire+glib** — whichever compile-time
  adapter is active on Linux; each turns OS/compositor-owned pixel memory
  into the same `Imaging::ImageData` shape. `WindowsAdapter` exists but
  `_createGrabber` just returns `nullptr` — no DXGI code, no working
  capture, never functional on Windows.

## 2. Aurora-App-Linux — same physical steps, now behind named interfaces

Same operations, but split across four repos (`Aurora` core,
`Aurora-Input-Linux`, `Aurora-Output-Hue`, `Aurora-App-Linux`) and passed
through explicit contracts instead of being one class's private state.
`Orchestrator` (generic, knows nothing about X11 or Hue) replaces
`Runtime::_update()`; it takes one `IInput&` and a `vector<IOutput*>`,
so — unlike huenicorn — more than one output can run at once.

```mermaid
graph LR
  A["XShm / Pipewire capture<br/>(Aurora-Input-Linux)"] -->|"IInput::grabFrameSubsample()"| B["Contracts::ImageData<br/>(cv::Mat + PixelFormat)"]
  B --> C["Processing::rescale / dropAlpha<br/>(Aurora core, pure)"]
  C --> D["Runtime::composeFrame<br/>+ ZoneMap (UV crop + average)"]
  D --> E["Contracts::Frame<br/>{zoneId, color, gamma}"]
  E --> F["Smoother<br/>(RGB easing)"]
  F --> G["IOutput::send(Frame)"]
  G --> H["HueOutput::toChannelStream<br/>(Aurora-Output-Hue, XYB + gamma)"]
  H --> I["Streamer / DtlsClient<br/>(Mbed TLS encrypt)"]
  I --> J["UDP :2100 → Hue bridge"]
```

Driven by `Aurora-App-Linux/main.cpp`'s tick loop calling
`Orchestrator::update()` at `Config::refreshRate()`, on one thread — the
threading model didn't get more complex, just moved out of `Runtime` and
into the app layer, since `Orchestrator` deliberately owns no timing itself.

**Libraries doing the interpreting — same set as huenicorn, moved to
explicit boundaries:**
- **OpenCV** — still the universal image type, now `Contracts::ImageData`;
  every capture backend (`XShmGetImage`'s shared memory, a Pipewire buffer)
  gets wrapped into it with an explicit row stride, which is what let the
  Pipewire-buffer stride bug get caught and fixed as a real, tested case.
- **glm** — unchanged role, now living in `Contracts::UV`.
- **nlohmann::json** — same library, but the read/write logic moved into
  dedicated `ConfigStore`/`ZoneMapStore` classes with explicit
  `toJson`/`fromJson` functions and field-by-field defaulting (a hand-edited
  or older config file degrades gracefully instead of failing to parse).
- **libcurl** / **Mbed TLS** — identical roles and identical protocol split
  (HTTPS REST vs. DTLS streaming) to huenicorn, just reached through
  `HttpClient`/`DtlsClient` classes with `ApiTools`' pure JSON-parsing
  functions sitting between "bytes came back" and "what they mean."
- **X11/Xext/Xrandr**, **libpipewire+glib** — same interpreting role as
  huenicorn, now behind `IInput`, with `SessionDispatch` doing at runtime
  what huenicorn's `Platform::Selector` did at compile time for this one
  axis (X11 vs. Wayland are auto-selected backends of one plugin, not two).

## 3. Aurora-App-Windows — identical from `Processing` onward

In practice, only the capture box changed to get here. Every step from
`Processing::rescale` through the DTLS send is the **same compiled code**
as the Linux app — not reimplemented, not a parallel Windows path.

```mermaid
graph LR
  A["DXGI Desktop Duplication<br/>(Aurora-Input-Windows)"] -->|"IInput::grabFrameSubsample()"| B["Contracts::ImageData<br/>(cv::Mat + PixelFormat)"]
  B --> C["Processing::rescale / dropAlpha<br/>(Aurora core — unchanged)"]
  C --> D["Runtime::composeFrame<br/>+ ZoneMap (unchanged)"]
  D --> E["Contracts::Frame (unchanged)"]
  E --> F["Smoother (unchanged)"]
  F --> G["IOutput::send(Frame)"]
  G --> H["HueOutput (unchanged,<br/>Aurora-Output-Hue)"]
  H --> I["Streamer / DtlsClient<br/>(Mbed TLS — unchanged)"]
  I --> J["UDP :2100 → Hue bridge"]
```

**Libraries doing the interpreting — one genuinely new one, everything else
identical:**
- **DXGI / Direct3D 11** — the new arrival. `IDXGIOutputDuplication`
  interprets the GPU compositor's shared texture; a staging `ID3D11Texture2D`
  + `Map()` is what actually makes it CPU-readable. Its row pitch can exceed
  the tightly-packed width — the same "explicit stride, own the memory
  before it's invalidated" pattern already learned from Pipewire's buffers,
  applied a second time on a completely different API.
- **Microsoft::WRL::ComPtr** — not a data-interpreter, a lifetime one:
  the direct analog of `X11Grabber`'s hand-rolled `XUniquePtr` deleters, for
  COM's reference-counted interfaces (`IDXGIFactory1`, `ID3D11Device`, etc.).
- **Win32 GDI** (`EnumDisplaySettingsW`, `GetMonitorInfoW`) — the Windows
  equivalent of RandR: interprets the OS's own multi-monitor/display-mode
  APIs into the same generic `MonitorData` shape `X11Grabber` already
  populates, feeding the same `Config::activeMonitorName` /
  `MonitorSelector` mechanism on both platforms unchanged.
- **OpenCV, glm, nlohmann::json, libcurl, Mbed TLS** — literally the same
  roles as the Linux app, same source code, provided on Windows via vcpkg
  (classic mode) instead of `apt`, with zero change to how any of them are
  *used* — only how they're *provisioned* differs, which is a toolchain
  concern, not an architectural one (see `WindowsInputAnalysis.md`).

## What this comparison actually shows

- The **capture → `ImageData`** boundary is where every platform's native
  library (X11/Xext/Xrandr, libpipewire+glib, DXGI/D3D11) does its
  interpreting — and, for the two platforms actually built so far, it's the
  only boundary that's had to change.
- The **`ImageData` → `Frame` → bridge** path (`Processing`, `Orchestrator`,
  `HueOutput`, `Streamer`) is identical code on both platforms today —
  not "ported," not "reimplemented," the same compiled library.
- huenicorn's version of this same pipeline had no such boundary at all —
  one `IGrabber*`, one `Runtime`, one `Streamer`, compiled together. The
  module split didn't change what the code *does*; it moved the exact same
  operations behind an interface at the `ImageData` seam.
- Whether `ImageData` stays the *only* seam that ever needs to vary — vs.
  `Processing`/`Output` also splitting apart someday — is exactly the open
  question `DistributedArchitecturePlan.md` leaves unresolved. Nothing here
  argues either way; it just shows what the one seam built so far actually
  looks like in working code.

## Related docs

- `ModuleSplitPlan.md` — why the split happened where it did, and the
  repo-per-plugin reasoning behind `Aurora-Input-Linux`/`-Windows` and
  `Aurora-Output-Hue` being separate repos rather than folders.
- `RuntimeAnalysis.md` / `WindowsInputAnalysis.md` — the deeper per-module
  analysis this doc summarizes into one cross-platform comparison.
- `DistributedArchitecturePlan.md` — the still-open question of whether the
  `ImageData` boundary shown here should ever become a real network seam.
