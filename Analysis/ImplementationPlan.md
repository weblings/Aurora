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
- **Compile-time modules, not dynamic plugins.** "Plugin" here means a
  self-contained module implementing the shared `IInput`/`IOutput` interface,
  selected and linked at build time per target — separate CMake targets, the
  same shape as huenicorn's existing `Platform::Selector` (`#ifdef`-based
  compile-time adapter choice), just generalized. A real hot-swappable
  runtime-loaded plugin system (stable ABI, `.dll`/`.so` loading) is real extra
  complexity with no payoff at this scope — deferred, see Stretch.
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

```
../huenicorn/      <- untouched upstream reference clone, sibling on disk, not in this repo
Aurora/            <- this repo's root
  core/             <- new: the distilled, module-split C++ app (name TBD)
    Contracts/        <- DONE: neutral shared types, see ModuleSplitPlan.md's
                          "middle contract" update and ProcessingAnalysis.md
      include/Aurora/Contracts/ (ImageData, UV, Color, Interpolation)
      src/Interpolation.cpp
    Processing/       <- DONE (ImageProcessing part): ported with 3 bug
                          fixes found during the port, see ProcessingAnalysis.md
      include/Aurora/Processing/ImageProcessing.hpp
      src/ImageProcessing.cpp
      Frame.hpp        <- NOT YET: the Processing->Output contract type,
                          still pending IOutput's actual implementation
      ISF/             <- new (phase 5, native side is minimal — see below)
    Input/            <- NOT YET
      IInput.hpp        (generalized from IGrabber — same shape)
      Linux/            <- Pipewire/X11 grabbers, ported from huenicorn (phase 1)
      Windows/          <- new (phase 2)
    Output/           <- NOT YET
      IOutput.hpp
      Hue/            <- ported from huenicorn's Hue::Api + Stream (phase 1)
      ThreeJS/        <- new: HTTP server extensions (phase 3)
    tests/            <- DONE (Processing coverage): Catch2, see
                          ProcessingAnalysis.md's test plan
  web/               <- new: the browser client (phases 3-5)
  Analysis/          <- already exists
```

**Build-verified.** No toolchain existed on the Windows dev machine, so a WSL2
Ubuntu environment was set up (`build-essential`, `cmake`, `libopencv-dev`,
`libglm-dev` via `apt`) — built from `~/aurora` on WSL's native filesystem, not
the Windows-mounted `/mnt/d` path, which hit real CMake `configure_file`
permission failures (a known DrvFs limitation, not a code problem). One real
CMake bug found and fixed along the way: `enable_testing()` was called inside
`tests/CMakeLists.txt` instead of the parent `core/CMakeLists.txt`, so the test
binary built fine but `ctest` couldn't discover it — fixed by moving
`enable_testing()` to the parent scope, before `add_subdirectory(tests)`.
**Result: 8/8 tests passing**, covering all three regression fixes plus the
pure `Color` math.

## Phase 1 — Refactor into three modules; Linux input + Hue output plugins

Pure restructuring, zero new features. **Demonstrable:** the restructured app
captures the Linux screen and drives real Hue lights exactly like huenicorn does
today — this is the regression check everything else builds on.

1. **Analysis pass first.** Three docs, each covering its section holistically
   before any code moves. **Done:** `Analysis/ProcessingAnalysis.md` — covers
   `ImageData`/`UV`/`Color`/`Interpolation`/`ImageProcessing`, and is where the
   `Contracts` vs `Processing` split (recorded back into `ModuleSplitPlan.md`)
   and three real bugs (found during the read/port, not just theorized) came
   from. **Still pending:** `Analysis/LinuxCaptureAnalysis.md`
   (`PipewireGrabber`/`X11Grabber`/`DummyGrabber`/`GnuLinuxAdapter` — how
   session-type dispatch actually works, what each grabber assumes, the
   Gamescope special-case) and `Analysis/HueOutputAnalysis.md`
   (`Hue::Api::*`/`Stream::*` — auth/pairing flow, the entertainment-config
   selection lifecycle, the DTLS/HueStream wire format, plus where
   `Color::toXYB()` lands as a free function and its own tests). `FirstScan.md`
   already covers the interfaces at a high level; these go one level deeper,
   per section, right before that section's code is actually touched.

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
3. **Not yet.** Introduce `IInput` (`IGrabber`, generalized/renamed;
   `ImageData`/`PixelFormat` unchanged) and move Linux capture
   (`PipewireGrabber`, `X11Grabber`, `DummyGrabber`, `GnuLinuxAdapter`'s
   grabber factory) under `Input/Linux/` as its own CMake target — the "Linux
   input plugin."
4. **Done.** Introduced the `Processing` module (plus, as it turned out,
   `Contracts` underneath it — see `ModuleSplitPlan.md`): moved
   `ImageProcessing` into `Aurora::Processing`, and `Color`'s generic parts
   (`toNormalized()`/`brightness()`) plus `ImageData`/`UV`/`Interpolation`
   into `Aurora::Contracts`. Per the earlier gamma decision, `Color::toXYB()`
   was **not** ported here — it (and `Channel::gammaExponent()`) still need to
   move into `Output/Hue/` as a free function when that section is ported;
   `Color` in `Contracts` has no Hue-shaped method on it at all now, by
   construction, not just convention.
5. **Not yet.** Introduce `IOutput` (drafted in `ModuleSplitPlan.md`) and move
   `Hue::Api::*`/`Stream::*` under `Output/Hue/` as its own CMake target — the
   "Hue output plugin."
6. **Not yet.** Define `Processing::Frame` — the neutral Input→Processing and
   Processing→Output contract. Phase 1 only needs the minimal version (mirrors
   today's `ChannelStream`: zone id + color); positions/effects/detections
   aren't needed until phases 3 and 5. Blocked on step 5 (`IOutput`) existing
   first, since `Frame` is what it consumes.
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
