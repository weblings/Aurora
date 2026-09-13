# Low-scope implementation plan

Five phases to prove out the Input/Processing/Output split
([`ModuleSplitPlan.md`](ModuleSplitPlan.md)) as a real, running vertical slice,
plus one deferred stretch. Order matches how the phases were scoped.

## Guiding principles

- Each phase ends in something demonstrable/runnable, not just code moved around.
- **Refactor first, prove no regression** before adding anything new — phase 1's
  restructured app must behave identically to today's huenicorn before phase 2
  touches anything.
- **`huenicorn/` stays an untouched reference clone.** Aurora's own module-split
  code goes in a new sibling directory, never edited in place — the same
  relationship RockyRoad keeps to ChartPlayer (`MusicThing/ChartPlayer` stays
  pristine; `RockyRoad/v2` is the distillation).
- **Compile-time modules, not dynamic plugins — and, as of 2026-09-13, separate
  repos per plugin.** A plugin implements the shared `IInput`/`IOutput`
  interface and gets linked at build time, same shape as huenicorn's
  `Platform::Selector` (`#ifdef`-based compile-time adapter choice), just
  generalized — still true. What changed: each plugin now lives in its **own
  repo** (`Aurora-Input-Linux`, `Aurora-Output-Hue`, ...), not inside Aurora
  core, so a plugin's own dependencies (`pipewire`/`libX11` for Linux capture,
  `mbedtls`/`CURL` for Hue's DTLS+REST) aren't forced onto Aurora core or onto
  unrelated plugins. See `ModuleSplitPlan.md`'s "Repo split" section for the
  full reasoning, including why this is *not* the same thing as license
  independence between plugins. A real hot-swappable runtime-loaded plugin
  system (stable ABI, `.dll`/`.so` loading, discovered by the web UI) is a
  separate, bigger decision — still deferred, see Stretch.
- **WebSockets deferred.** The browser bridge (phase 3) uses the existing
  httplib-based HTTP server with chunked responses (MJPEG for video preview,
  Server-Sent Events for effect/zone ticks) — zero new network dependency. True
  WebSocket duplex is a stretch "networking fork" after all five phases land,
  for when bidirectional/binary efficiency actually earns its keep.
- **Analysis pass before touching each section.** Before porting or extending
  any existing code — huenicorn's C++ (phase 1), its HTTP server (phase 3),
  RockyRoad's IWSDK/XR scaffolding (phase 4), or a third-party library's actual
  API (`interactive-shader-format-js`, phase 5) — write a holistic per-section
  analysis doc first, same shape as RockyRoad's own component docs
  (`SongPlayer.md`, `Camera3D.md`: what it does, what the new module actually
  needs from it, what maps directly vs. what needs rework). Goes in `Analysis/`
  alongside `FirstScan.md`. This is what "holistic view before starting" means
  in each phase below — not a one-time exercise, a per-section step every
  phase repeats.

## Proposed directory layout

`Aurora/` below is this git repo's own root (it has its own `.git`, separate
from huenicorn's). `huenicorn/` is **not** inside it — it's a plain sibling
clone on disk (this machine has both under one parent folder; that parent
folder isn't itself a repo and isn't architecturally significant). No git
link between the two: same relationship RockyRoad keeps to ChartPlayer (no
`.gitmodules` there either) — a reference codebase being read and distilled
into new code, not a compiled dependency, so it's cited by upstream URL in
prose (`https://gitlab.com/openjowelsofts/huenicorn.git`), not linked in git.
Submodules stay reserved for an actual future build-time dependency, if one
ever gets vendored as source.

Repo layout as of the 2026-09-13 split — one core repo, one repo per plugin,
all siblings on disk (not architecturally required, just this machine's
arrangement, same as `huenicorn/`):

```
../huenicorn/            <- untouched upstream reference clone, not in any Aurora repo
Aurora/                  <- core repo
  core/
    Contracts/             <- DONE: neutral shared types (ImageData, UV, Color,
                               Interpolation, Frame/Zone) — see ModuleSplitPlan.md
      include/Aurora/Contracts/
      src/Interpolation.cpp
    Processing/            <- DONE: ImageProcessing, ported with 3 bug fixes
                               found during the port, see ProcessingAnalysis.md
      include/Aurora/Processing/ImageProcessing.hpp
      src/ImageProcessing.cpp
      ISF/                 <- new (phase 5, native side is minimal — see below)
    Input/                 <- DONE: IInput.hpp (refined with monitor selection +
                               divisor math, see LinuxCaptureAnalysis.md) + MonitorData.hpp.
      include/Aurora/Input/                          Concrete plugins live in their own repos now.
    Output/                <- DONE: IOutput.hpp, now with zoneIds() for live
                               zone discovery (see RuntimeAnalysis.md).
      include/Aurora/Output/IOutput.hpp
    Runtime/               <- DONE (generic pieces only, see RuntimeAnalysis.md):
                               Config/ConfigStore, ZoneMap/ZoneMapStore
                               (one profile file per plugin), reconcileZoneMap,
                               composeFrame, Smoother (RGB, keyed per
                               (outputId, zoneId)). The orchestrating
                               lifecycle class itself is a later pass — no
                               second real IOutput yet to wire it against.
      include/Aurora/Runtime/
      src/
    tests/                 <- DONE (Processing + Runtime coverage): Catch2, see
                               ProcessingAnalysis.md/RuntimeAnalysis.md's test plans
  web/                    <- new: the browser client (phases 3-5)
  Analysis/               <- already exists
Aurora-Input-Linux/       <- plugin repo, DONE for X11 + Pipewire (see
                             LinuxCaptureAnalysis.md): DummyGrabber,
                             SessionDispatch (tested pure logic), X11Grabber
                             (mechanically ported, builds against real
                             X11/Xext/Xrandr, needs a real X11 session to
                             manually verify actual capture), PipewireGrabber/
                             XdgDesktopPortal (mechanically ported, builds
                             against libpipewire-0.3/glib-2.0, needs a real
                             Wayland session + portal backend to manually
                             verify; gamescope-node matching and raw-buffer-
                             to-ImageData conversion extracted as pure, tested
                             helpers this pass). Restore-token persistence
                             (huenicorn's Core::Config dependency) resolved
                             via a minimal local IRestoreTokenStore interface
                             rather than waiting on Aurora core's Config/
                             Runtime. One CMake option per backend
                             (AURORA_INPUT_LINUX_ENABLE_X11/_PIPEWIRE) so unrelated
                             deps aren't forced — X11 and Wayland are one plugin's
                             two auto-selected backends, not two separate plugins
                             (see ModuleSplitPlan.md's repo-split section).
Aurora-Output-Hue/        <- plugin repo, pure logic DONE (see HueOutputAnalysis.md):
                             Colorimetry (toXYB), Channel, HuestreamHeader/Payload,
                             BridgeAddress, Credentials byte-conversion, all tested.
                             I/O layer (ApiTools, EntertainmentConfigurationSelector,
                             Streamer/DtlsClient, Network::Http::Client) analyzed,
                             deferred — needs Aurora core's Config/Runtime to exist
                             first, and its own real-bridge manual verification.
```

**Aurora core build-verified.** No toolchain existed on the Windows dev
machine, so a WSL2 Ubuntu environment was set up (`build-essential`, `cmake`,
`libopencv-dev`, `libglm-dev` via `apt`) — built from `~/aurora` on WSL's
native filesystem, not the Windows-mounted `/mnt/d` path, which hit real CMake
`configure_file` permission failures (a known DrvFs limitation, not a code
problem). One real CMake bug found and fixed along the way: `enable_testing()`
was called inside `tests/CMakeLists.txt` instead of the parent
`core/CMakeLists.txt`, so the test binary built fine but `ctest` couldn't
discover it — fixed by moving `enable_testing()` to the parent scope, before
`add_subdirectory(tests)`. **Result: 8/8 tests passing**, covering all three
regression fixes plus the pure `Color` math. Both lessons recorded in
`Analysis/lessons/engineering-hygiene.md`.

**`Aurora-Output-Hue` build-verified** — same WSL2 flow, copied into
`~/AuroraProjects/{Aurora,Aurora-Output-Hue}` (matching casing needed for the
`../Aurora/core` sibling path in its `CMakeLists.txt`). No new `apt` packages
needed — the ported pure logic only needs OpenCV+glm, already installed.
**Result: 10/10 tests passing**, including a sanity check that white maps
within 0.001 of the real CIE D65 white point (0.3127, 0.3290) — confirms the
colorimetry port is actually correct, not just internally self-consistent.
One real bug found and fixed: the test file's `using namespace
Aurora::Output::Hue;` didn't bring `Aurora::Contracts` into scope, so
`Contracts::UVCorner` didn't resolve — fixed to `using namespace
Aurora::Contracts;` with the now-redundant `Contracts::` prefix dropped at
each call site.

**`Aurora-Input-Linux` build-verified (X11 backend)** — needed one new `apt`
package set installed by the user (`libx11-dev libxext-dev libxrandr-dev`;
this session doesn't run `sudo`), otherwise same WSL2 flow. **Result: 5/5
tests passing**, including the `_divisors()` regression test (a 12×6 input
now correctly yields all 4 valid candidate resolutions, not the 2 the
off-by-one bug limited it to). Hit the identical `using namespace
Aurora::Output::Hue;`-shaped mistake again — added `using namespace
Aurora::Contracts;` to the test file but forgot to strip the still-present
`Contracts::` prefixes at each call site, so it didn't actually fix anything
the first time. Recorded as a recurrence in `engineering-hygiene.md`, not
just a repeat fix. `X11Grabber.cpp` itself compiled cleanly against real
X11/Xext/Xrandr; actually verifying capture still needs a real X11 session,
which neither this Windows machine nor WSL2 (WSLg is a virtualized Wayland
compositor, not real X11 hardware capture) can provide.

**`Aurora-Input-Linux` build-verified, Pipewire included** —
`libpipewire-0.3-dev`/`libglib2.0-dev` were missing on first pass (checked
via `pkg-config`), so per this session's no-`sudo`-via-tool-call rule that
install was left to the user; once installed, reconfigured with default
options (both `AURORA_INPUT_LINUX_ENABLE_X11`/`_PIPEWIRE` on) and rebuilt.
`PipewireGrabber.cpp`/`XdgDesktopPortal.cpp` now compile cleanly against real
`libpipewire-0.3` (1.6.2) and `glib-2.0`/`gio-2.0`/`gio-unix-2.0` (2.88.0),
zero errors or warnings. **Result: 11/11 tests passing** (5 pre-existing + 6
new: gamescope node matching, raw-buffer-to-`ImageData` conversion including
a stride-vs-tightly-packed regression check). Actually exercising capture
still needs a real Wayland session + portal backend, which this Windows
machine/WSL2 can't provide (same caveat as `X11Grabber`).

Two real bugs found while porting `XdgDesktopPortal` (see
`LinuxCaptureAnalysis.md`): a missing early `return` in
`onCreateSessionResponseReceivedCallback` that let a denied/cancelled session
fall through to use an unvalidated result, and a pointless `strdup` leak in
`getSenderName()`. Both fixed. Also flagged as a lesson (not fixed, since
consistent with prior ports): dropping `Core::Logger` calls for the lack of
an Aurora-core logger is now costing real diagnostics twice over, worth
prioritizing before the next I/O-heavy port (Hue's `Streamer`/DTLS layer).

**`Aurora/core`'s new `Runtime` module build-verified** — added
`nlohmann_json` as a new core dependency (same find-package-else-`FetchContent`
pattern as glm; huenicorn already uses this exact library). Built
`Config`/`ConfigStore`, `ZoneMap`/`ZoneMapStore`, `reconcileZoneMap`,
`composeFrame`, `Smoother` per the decided `RuntimeAnalysis.md` shape (RGB
smoothing in Runtime, one profile file per plugin). **Result: 16/16 core
tests passing** (8 pre-existing Processing + 8 new Runtime). Also rebuilt
`Aurora-Output-Hue` (10/10) and `Aurora-Input-Linux` (11/11) against this
updated core to confirm the `IOutput::zoneIds()` interface addition doesn't
break either — neither has a concrete `IOutput` implementation yet, so
nothing needed updating. As part of the same pass, removed
`Aurora-Output-Hue`'s now-dead `Channel::previousXyb`/`hasPreviousXyb`
(XYB-space smoothing state made obsolete by the RGB-in-Runtime decision) —
rebuilt clean, no test changes needed.

## Phase 1 — Refactor into three modules; Linux input + Hue output plugins

Pure restructuring, zero new features. **Demonstrable:** the restructured app
captures the Linux screen and drives real Hue lights exactly like huenicorn does
today — this is the regression check everything else builds on.

1. **Analysis pass first.** Three docs, each covering its section holistically
   before any code moves. **All three done:** `Analysis/ProcessingAnalysis.md`
   (the `Contracts` vs `Processing` split, three real bugs found during the
   read/port), `Analysis/HueOutputAnalysis.md` (the pure-vs-I/O split that
   scoped that pass, the `Contracts::Frame` naming correction, the
   SSL-verification-disabled constraint worth carrying forward carefully), and
   `Analysis/LinuxCaptureAnalysis.md` (why X11 ports now but Pipewire doesn't,
   a fourth bug found — `_divisors()`'s off-by-one — and the `IInput`
   refinement it drove). `FirstScan.md` already covers the interfaces at a
   high level; these go one level deeper, per section, right before that
   section's code is actually touched.

   **Existing tests — checked, not usable as-is.** huenicorn's `tests/` has no
   working automated test today: `TestImageProcessing` and `TestGrabber`
   (`tests/AddTests.cmake`, gated behind `BUILD_TESTS`, default `FALSE`) both
   reference source/header paths from before the `Core`/`Hue`/`Imaging`/`Platform`
   reorganization (e.g. `src/PlatformSelector.cpp`, which is now
   `src/Platform/Selector.cpp`) and call at least one signature that no longer
   exists (`getSubImage`'s old two-`glm::vec2`-corner form vs. today's
   `Imaging::UVs`) — neither compiles as-is. A third file,
   `tests/src/GamescopeGrabTest.cpp`, does use current APIs but isn't wired
   into any CMake target at all. All three are visual/manual smoke tests
   anyway (write PNGs to disk, log FPS/mean-color, run for a fixed duration) —
   there's no assertion framework in the dependency list at all. This means
   phase 1's "prove no regression" needs a **new** safety net, not a revived
   one:
   - Add a real test framework (Catch2 or doctest — light, `FetchContent`-able,
     matches how huenicorn already pulls in nlohmann_json/glm) as part of this
     phase.
   - **Pin `Processing`'s pure functions with golden-value tests** —
     `rescale`, `getSubImage`, `getDominantColor`/`Algorithms::mean` are all
     deterministic (no OS/display/network involved); `Color::toXYB()` turned
     out to belong in this bucket too but ends up tested alongside
     `Output/Hue/` instead, since it moved there (see step 4). **Done and
     passing** for the `Processing` half — 8/8 tests, see
     `core/tests/ProcessingTests.cpp` and the directory-layout note above.
   - **Capture and Hue-streaming stay manual**, by nature — they depend on a
     real display session and (for Hue) a real bridge, so they aren't
     something CI can assert on. Fix `GamescopeGrabTest.cpp`-style checks to
     compile and keep them as a documented manual runbook (run N frames, count
     non-black, log average FPS) rather than pretending they're automatable.
2. **Done.** Stood up `Aurora/core` as a new CMake project seeded from
   huenicorn's, not an edit of `huenicorn/` itself.
3. **Done.** Introduced `IInput` in Aurora core (generalized from `IGrabber`,
   refined with monitor selection + the pure divisor math — see
   `ModuleSplitPlan.md`), and started `Aurora-Input-Linux` as its own repo
   (repo-split decision, same doc). Ported and tested `DummyGrabber` and the
   session-dispatch decision logic (`SessionDispatch`); mechanically ported
   `X11Grabber` (builds, needs a real X11 session to manually verify
   capture). Mechanically ported `PipewireGrabber`/`XdgDesktopPortal` too —
   1091 lines of D-Bus/GLib glue, but this pass found two genuinely pure,
   testable pieces inside it (gamescope node matching, raw-buffer-to-
   `ImageData` conversion) that the first scoping pass hadn't surfaced.
   Builds cleanly against real `libpipewire`/`gio` dev packages; still needs
   a real Wayland session to manually verify capture — tracked in
   `LinuxCaptureAnalysis.md`.
4. **Done.** Introduced the `Processing` module (plus, as it turned out,
   `Contracts` underneath it — see `ModuleSplitPlan.md`): moved
   `ImageProcessing` into `Aurora::Processing`, and `Color`'s generic parts
   (`toNormalized()`/`brightness()`) plus `ImageData`/`UV`/`Interpolation`
   into `Aurora::Contracts`. Per the earlier gamma decision, `Color::toXYB()`
   was **not** ported here — see step 5, it landed in `Aurora-Output-Hue`
   instead, as a free function; `Color` in `Contracts` has no Hue-shaped
   method on it at all now, by construction, not just convention.
5. **Done (pure logic).** Introduced `IOutput` in Aurora core (header-only
   interface target, no `Config*` param — see `ModuleSplitPlan.md`), and
   started `Aurora-Output-Hue` as its own repo (repo-split decision, same doc).
   Ported and tested `toXYB()`, `Channel`, `HuestreamHeader`/`HuestreamPayload`,
   `sanitizeBridgeAddress`, `Credentials`'s byte-conversion — everything pure.
   **Deferred**, tracked not forgotten: `ApiTools`, `EntertainmentConfigurationSelector`,
   `Streamer`/`DtlsClient`, and the `Network::Http::Client` dependency they all
   need — genuine I/O needing a live bridge to verify, and blocked on
   `Config`/`Runtime` existing in Aurora core to actually wire a concrete
   `HueOutput : IOutput` together.
6. **Done.** `Contracts::Frame`/`Zone` — the neutral Input→Processing and
   Processing→Output contract (renamed from the `Processing::Frame` this step
   originally described — see `ModuleSplitPlan.md`'s naming correction).
   Minimal v1 shape (zone id + linear color); positions/effects/detections
   aren't needed until phases 3 and 5.
7. **Not yet.** Rewire `Runtime` to depend on `IInput`/`IOutput`, selecting
   `Input::Linux` + `Output::Hue` at compile time (generalizes today's
   `Platform::Selector` pattern rather than replacing it).
8. **Done for `Processing`** — golden-value tests run on WSL2 Ubuntu, 8/8
   passing. The manual runbook against a real bridge stays blocked on
   `Input::Linux`/`Output::Hue` existing. Carry the setup/config REST server
   over as-is; it isn't Input/Processing/Output-specific, don't redesign it
   here.

## Phase 2 — Windows input plugin

Fills in `WindowsAdapter`'s `_createGrabber` stub (currently returns `nullptr`).

- **Lighter analysis pass than phase 1** — there's no existing script to port
  here (the stub just returns `nullptr`), so this is a short note
  (`Analysis/WindowsInputAnalysis.md`) on what `IInput` actually requires of an
  implementer plus DXGI Desktop Duplication's real API shape (frame
  acquisition, format, the resize/re-acquire lifecycle) verified against
  Microsoft's docs before coding against assumed behavior — not a full
  conversion-analysis doc since nothing's being converted.
- Implement `IInput` using **DXGI Desktop Duplication** (the modern Windows
  screen-capture API) — outputs BGRA natively, which conveniently matches what
  the pipeline already assumes.
- This is also the moment to fix `ImageProcessing::Algorithms::mean()` to
  actually honor `PixelFormat` instead of hardcoding a BGR channel swap
  (flagged in `FirstScan.md`) — phase 2 is the first time a second real capture
  source exists to make that bug matter in practice.
- **Demonstrable:** the same app, built on Windows, captures the Windows desktop
  and drives Hue lights through the unchanged `Output::Hue` plugin — proof the
  module boundary actually holds when Input is swapped and nothing else is
  touched.
- Known gotcha worth planning for (candidate for `Analysis/lessons/input.md`
  once actually hit): DXGI Desktop Duplication requires an interactive desktop
  session and needs its duplication interface re-acquired on resolution/display
  changes.

## Phase 3 — Three.js browser output plugin

A new Output target: a browser page showing the live video preview and a 3D
visualization of the effect/zone data reacting in real time — the "virtual
lights around a screen" preview, and the base scene phase 4 goes immersive with.

- **Analysis pass first:** `Analysis/HttpServerAnalysis.md` covering
  `Network::Http::Server` holistically (`HttpServer`/`HttpLibServerImpl` —
  how the existing setup-WebUI routes are wired, request/response lifecycle,
  what httplib actually supports for chunked responses) before adding anything
  to it — extending a shared server wrong risks the existing setup WebUI, not
  just the new endpoints.
- **Native side:** extend the existing httplib-based server (already present for
  the setup WebUI) with two endpoints, no new dependency:
  - a chunked MJPEG endpoint serving the already-downsampled preview frames
    (JPEG-encode the same small `ImageData` already computed for color
    sampling via OpenCV's `imencode` — already a dependency, no new capture or
    encode pipeline needed)
  - a Server-Sent Events endpoint pushing each tick's `Processing::Frame` as
    JSON
- New `Output::ThreeJS` module implements `IOutput`; `send()` forwards the
  `Frame` to connected SSE clients. Note this needs `Runtime` to hold a **list**
  of active outputs rather than the single `m_streamer` huenicorn has today —
  Hue and the browser preview run simultaneously, not one-or-the-other.
- **Browser side** (new `web/`): a Three.js page rendering the MJPEG preview as
  a plane/texture, subscribing to the SSE endpoint, and drawing each zone as a
  colored 3D element positioned by its UV on the video plane.
- **Demonstrable:** open a browser tab, see the captured screen playing back
  with virtual colored light indicators reacting live around it — driven by the
  exact same Processing ticks simultaneously driving real Hue bulbs.

## Phase 4 — Extend to WebXR (reference RockyRoad)

Same phase-3 scene, made viewable in a headset — reusing RockyRoad's
already-solved groundwork instead of rediscovering it.

- **Analysis pass first**, and this one doubles as the source for the next
  bullet: read
  [`RockyRoad/Analysis/lessons/engine/dev-environment.md`](../../RockyRoad/Analysis/lessons/engine/dev-environment.md)
  and
  [`xr-3d-rendering.md`](../../RockyRoad/Analysis/lessons/engine/xr-3d-rendering.md),
  and write `Analysis/RockyRoadXRAnalysis.md` covering RockyRoad's actual
  IWSDK/Scene3D/Camera3D scaffolding holistically (not just the lessons list —
  the working code itself: `v2/src/`'s engine layer) before bootstrapping
  `web/` from it. The Windows/Vite/IWSDK setup gotchas and the local-Z
  camera-fixed-HMD rendering pattern are already documented in those lessons
  files; no need to rediscover them.
- Bootstrap from RockyRoad's IWSDK setup
  ([`v2/ARCHITECTURE.md`](../../RockyRoad/v2/ARCHITECTURE.md)) rather than from
  scratch — "put 3D content in a WebXR headset via Vite + IWSDK" is generic
  scaffolding, not note-highway-specific, so it's a legitimate distillation
  target the same way ChartPlayer's engine layer was distilled into RockyRoad.
- **Shared-util-library candidates — flag, don't build.** If the analysis pass
  above turns up pieces of RockyRoad's custom XR logic (`Camera3D`, the
  local-Z helpers, IWSDK bootstrap glue) that are genuinely generic rather than
  note-highway-specific, note them in `Analysis/RockyRoadXRAnalysis.md` as
  candidates for a shared package between RockyRoad and Aurora. Don't extract
  one preemptively and don't go broad — capped to what's actually generic.
  **Pitch the specific candidates before doing any extraction work**, when
  phase 4 actually reaches this point, rather than deciding it here.
- **License note:** this reuses RockyRoad's engine scaffolding (GPLv3, itself
  carried from ChartPlayer) — already compatible with Aurora's own GPLv3
  (carried from huenicorn), just worth stating explicitly in `web/`'s own
  license note once one exists, the same way RockyRoad's README credits
  ChartPlayer.
- **Demonstrable:** put on a headset, see the same video-plane-plus-reactive-
  lights scene from phase 3, now immersive/stereo.

## Phase 5 — ISF processing connection

Wires ISF shaders in as the actual visual-effect layer for the browser/WebXR
output, per `OpenFormatsResearch.md`'s finding that ISF fits this target better
than any lighting-specific format.

- **Analysis pass first:** `Analysis/ISFRendererAnalysis.md` — read
  [`interactive-shader-format-js`](https://github.com/msfeldstein/interactive-shader-format-js)'s
  actual source/README (its real constructor/input-setting/draw API, which
  input types it actually supports vs. the full ISF spec) before designing the
  `Frame`-to-ISF mapping against it. Same rigor RockyRoad's
  `web-audio-worklets.md` lesson already flags: verify a third-party library's
  actual API before designing around assumed prior knowledge — this library is
  small and less actively maintained than the spec itself, so this check
  matters more here than for a major dependency.
- Use `interactive-shader-format-js` in `web/`'s Three.js scene, rather than
  writing an ISF/GLSL-JSON parser from scratch. Load a handful of existing open
  shaders from [isf.video](https://isf.video/)'s library as a starting effect
  set.
- Map `Processing::Frame` fields onto each loaded shader's declared inputs (a
  zone's color → an ISF `color` input, a zone's UV → a `point2D` input, etc.).
  This is the actual "processing connection" — it happens entirely browser-side
  on top of phase 3's existing SSE channel; no native/protocol changes needed.
- **Demonstrable:** swap which ISF shader is active and watch the XR scene's
  visual effect change, still driven by the same live color/zone data, with the
  native pipeline untouched.

## Stretch / explicitly deferred

- **Networking fork: WebSockets.** Once bandwidth or bidirectional control
  (WebXR pose back to the native core, browser-side effect selection persisted
  server-side) actually need it, replace phase 3's SSE+chunked-MJPEG channel
  with a WebSocket one (new dependency — e.g. uWebSockets, IXWebSocket, Boost.Beast).
  Not needed for phases 1–5 to work end to end.
- **Object detection (YOLO-style)** — designed in `OpenFormatsResearch.md`, not
  part of this pass; slots into `Processing` after phase 5.
- **Additional Output targets** (DMX/Art-Net/sACN, OPC/DDP) — deferred the same way.
- **Dynamic/hot-swappable plugin loading** — only revisit if compile-time module
  selection actually becomes a real pain point (e.g. wanting one binary to
  support many outputs without recompiling).
