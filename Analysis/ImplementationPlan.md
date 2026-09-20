# Low-scope implementation plan

Five phases to prove out the Input/Processing/Output split
([`ModuleSplitPlan.md`](ModuleSplitPlan.md)) as a real, running vertical slice,
plus one deferred stretch. Order matches how the phases were scoped. Phase
2.5 (audio) was inserted later, independent of phases 3–5 — it doesn't
renumber anything since it isn't sequentially gated by the browser work.

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
  web-processing/         <- new (phase 3, not started): hand-ported JS mirror
                             of Processing's crop/average math (rescale/
                             getSubImage/Algorithms::mean), kept in this repo
                             specifically so it sits next to the C++ it mirrors
                             for drift-checking (see BrowserAnalysis.md's
                             reuse-vs-reimplement finding). Aurora-Demo-Web
                             copies this source directly — no npm package for
                             now, see below.
    Input/                 <- DONE: IInput.hpp (refined with monitor selection +
                               divisor math, see LinuxCaptureAnalysis.md) + MonitorData.hpp.
      include/Aurora/Input/                          Concrete plugins live in their own repos now.
    Output/                <- DONE: IOutput.hpp, now with zoneIds() for live
                               zone discovery (see RuntimeAnalysis.md).
      include/Aurora/Output/IOutput.hpp
    Runtime/               <- DONE, see RuntimeAnalysis.md: Config/ConfigStore,
                               ZoneMap/ZoneMapStore (one profile file per
                               plugin), reconcileZoneMap, composeFrame,
                               Smoother (RGB, keyed per (outputId, zoneId)),
                               pickDefaultSubsampleWidth, and Orchestrator
                               (ties one IInput to any number of IOutputs
                               per-tick, no threading/timing of its own --
                               tested against FakeInput/FakeOutput). Not yet
                               built: a real app entry point/main() driving
                               it with real plugins in a real timed loop.
      include/Aurora/Runtime/
      src/
    tests/                 <- DONE (Processing + Runtime coverage): Catch2, see
                               ProcessingAnalysis.md/RuntimeAnalysis.md's test plans
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
Aurora-Output-Hue/        <- plugin repo, DONE (see HueOutputAnalysis.md): pure
                             logic (Colorimetry, Channel, HuestreamHeader/Payload,
                             BridgeAddress, Credentials byte-conversion) plus the
                             full I/O layer -- HttpClient (libcurl), ApiTools
                             (5 pure JSON-parsers + mechanical REST wrappers),
                             EntertainmentConfigurationSelector, DtlsClient/
                             MbedTlsImpl (Mbed TLS v3)/Streamer, and HueOutput :
                             IOutput tying it all together. Builds against real
                             libcurl/Mbed TLS; needs a real bridge to manually
                             verify capture actually reaches real lights.
Aurora-App-Linux/         <- new app repo, DONE (see DistributedArchitecturePlan.md
                             for why this got its own repo): Registry (name ->
                             factory for compiled-in plugins, tested) + main.cpp
                             (registers plugins per AURORA_APP_ENABLE_*, picks
                             which to run from Config::activeInputName()/
                             activeOutputNames(), drives Orchestrator::update()
                             in a real timed loop). First executable combining
                             all three repos -- builds and links clean against
                             every native dependency (X11, Pipewire/glib,
                             libcurl, Mbed TLS). Real end-to-end run (real
                             display + real bridge) pending the Ubuntu device.
Aurora-Demo-Web/         <- new repo (2026-09-14, not started, phase 3
                             milestone 1): the Three.js browser demo. File
                             input (bundled WebM sample + upload), the 9-slice
                             Three.js virtual-light output, and the demo scene
                             itself — all new code, no counterpart in `Aurora`.
                             The one non-new piece (crop/average math) is
                             copied from `Aurora/web-processing/` rather than
                             owned here, see above. No CMake, no native
                             backend — own toolchain (see ModuleSplitPlan.md's
                             repo-split section for why this qualified for a
                             separate repo more clearly than any plugin has).
```

*Build history lives in [log/2026-09-13-phase1-2-build-history.md](log/2026-09-13-phase1-2-build-history.md) — per-repo verification narratives (test counts, env setup, bugs found per pass), not repeated here.*

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
5. **Done.** Introduced `IOutput` in Aurora core (header-only interface
   target, no `Config*` param, later gaining `zoneIds()` — see
   `ModuleSplitPlan.md`/`RuntimeAnalysis.md`), and started
   `Aurora-Output-Hue` as its own repo (repo-split decision, same doc).
   Ported and tested `toXYB()`, `Channel`, `HuestreamHeader`/`HuestreamPayload`,
   `sanitizeBridgeAddress`, `Credentials`'s byte-conversion first (everything
   pure), then the full I/O layer once `Config`/`Runtime` existed:
   `HttpClient` (libcurl), `ApiTools`, `EntertainmentConfigurationSelector`,
   `DtlsClient`/`MbedTlsImpl` (Mbed TLS), `Streamer`, and finally
   `HueOutput : IOutput` itself — see `HueOutputAnalysis.md`'s staged
   follow-up pass. Genuine I/O still needs a live bridge to verify
   end-to-end, same category as `X11Grabber`.
6. **Done.** `Contracts::Frame`/`Zone` — the neutral Input→Processing and
   Processing→Output contract (renamed from the `Processing::Frame` this step
   originally described — see `ModuleSplitPlan.md`'s naming correction).
   Minimal v1 shape (zone id + linear color); positions/effects/detections
   aren't needed until phases 3 and 5.
7. **Done against fakes; `HueOutput` now exists too (step 5), so real
   plugins can be wired in next.** Built `Runtime::Orchestrator`, depending
   on both `IInput`/`IOutput`, tested with a `FakeInput`/`FakeOutput` pair
   standing in for `Input::Linux`/`Output::Hue` — see `RuntimeAnalysis.md`'s
   follow-up pass. What's left is a real `main()` (compile-time or
   config-time plugin selection) constructing real `X11Grabber`/`HueOutput`
   instances and driving `Orchestrator::update()` in an actual timed loop —
   not `Orchestrator` itself, which is unchanged by this.
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
- **Done.** Implemented `IInput` as `WindowsGrabber` using **DXGI Desktop
  Duplication**, built and hardware-verified — see the narrative paragraph
  above and `WindowsInputAnalysis.md`'s hardware-verified-pass section.
- Already fixed, not phase 2's doing: `ImageProcessing::Algorithms::mean()`
  already honors `PixelFormat` per-channel (done as part of phase 1's
  `ProcessingAnalysis.md` finding 1) — the stale claim that phase 2 would be
  the moment to fix it has been corrected in `WindowsInputAnalysis.md`.
- **Done.** The same app, built on Windows (`Aurora-App-Windows`), capturing
  the Windows desktop and driving real Hue lights through the unchanged
  `Output::Hue` plugin — confirmed live against the real bridge. See the
  narrative paragraph above.
- Confirmed real, not just a planning-stage concern (see
  `Analysis/lessons/input.md`): a non-blocking `AcquireNextFrame` poll can
  starve on placeholder frames forever, and a monitor Windows still lists as
  attached can be genuinely powered off with no API-level way to detect it.

## Phase 2.5 — Audio input & processing

Inserted between phases 2 and 3, not phase 6, because it's independent of
phases 3–5 (browser/WebXR/ISF) — it's a new `Input`+`Processing` track,
the same kind of foundational native work as phase 2, not something
gated on or by the browser output work. **Analysis pass already done,
extensively:** `Analysis/AudioAnalysis.md` — every decision below is
sourced from it rather than re-derived here.

**Demonstrable:** play music through whatever the user normally uses
(Spotify, browser, anything), watch real Hue lights bounce between a
vibrant complementary color pair on the beat, the pair itself slowly
rotating in hue over time, nudged by the track's own spectral content —
confirmed live against real hardware, same rigor as phase 2's real
end-to-end verification.

**In scope for this phase — live capture only** (provenance 3 in
`AudioAnalysis.md`'s breakdown), because it's the only provenance that
lets tuning happen by ear without also building audio playback:

**Unplanned, discovered mid-phase: X11/Pipewire pixel-format mistagging,
found and fixed.** A huenicorn-vs-Aurora color-accuracy comparison on
real hardware turned up wrong colors (blue scenes green/pink, red scenes
blue). Root cause: `X11Grabber` tagged captures `RGBA` when the real X11
memory layout is `BGRA` (ported verbatim from huenicorn, harmless there
since its `mean()` ignored the tag entirely; became live once Aurora's own
port made that code format-aware). Same class of bug existed in
`PipewireFrameBuffer.hpp`. Fixed and **confirmed on real hardware** --
colors now match huenicorn. See `Analysis/lessons/input.md`.

1. **Interface layer — rename done, verified where buildable.**
   `IInput`→`IVideoInput` across Core, `Aurora-Input-Windows`/`-Linux`,
   both App repos' `Registry`/`main.cpp`, `MonitorSelector`/`Orchestrator`,
   and both `RuntimeTests.cpp`/`OrchestratorTests.cpp`/`RegistryTests.cpp`
   fixtures — a whole-tree grep confirms zero remaining code references.
   **Windows side rebuilt and retested clean:** Core 26/26, `Aurora-Input-Windows`
   1/1, `Aurora-App-Windows` 4/4, all still passing after the rename. Linux
   side (`Aurora-Input-Linux`, `Aurora-App-Linux`) mechanically renamed and
   grep-clean, but not build-verified in this session — no Linux toolchain
   here, same limitation as phase 1/2's Linux work; needs a real build on
   the Ubuntu machine to confirm. **Done, also Windows-verified:**
   `IAudioInput` (Core, wholly independent interface, no shared base) and
   `Contracts::AudioBuffer` (raw samples + sample rate + channel count).
2. **Core `AudioProcessing` module, mirroring `ImageProcessing`'s shape —
   done and Windows-verified except aubio itself.** New `AuroraAudioProcessing`
   Core target (separate from `AuroraProcessing` deliberately, same
   dependency-isolation reasoning as the plugin repo split — only
   audio-enabled consumers need it linked). `Contracts::AudioFeatures`,
   `Color::fromHSV`/`toHSV` (verified against the palette table's known
   values, not just round-tripped), and the full color model —
   `randomAnchorHue` (six named pairs), `updateDrift` (fixed-direction
   rotation, rate-bias centroid nudge that never reverses direction,
   verified directly), `updateBounce` (RockyRoad's shortest-arc damping
   formula, onset-strength-scaled swing with a verified dynamism floor,
   RMS-driven brightness with a verified never-fully-dark floor) — all as
   pure functions taking an `AudioEffectSettings` struct (the
   `Config`-parameterization decided earlier), per `AudioAnalysis.md`'s
   formulas. **Result: 38/38 core tests passing** (12 new `AudioProcessing`
   tests + the pre-existing 26), rebuilt clean against `Aurora-App-Windows`
   too (4/4 still passing) with no regressions.

   **aubio wired in for real, verified against real signals — done.**
   Verified aubio's actual C API first (`new_aubio_onset`/`aubio_onset_do`,
   a phase-vocoder→`aubio_specdesc_t`→`aubio_bintofreq` chain for centroid)
   before writing anything — good thing: the onset output vector isn't a
   strength value (it's a 0/1+timing-offset signal; real strength needs
   `aubio_onset_get_descriptor()`), and aubio's objects turned out to be
   stateful, meaning `extractFeatures` couldn't stay the pure free function
   as designed. Added `AudioFeatureExtractor` (a small class wrapping
   aubio's onset/pvoc/specdesc objects, ring-buffering arbitrary incoming
   buffer sizes into aubio's fixed hop size, normalizing the raw onset
   descriptor to [0,1] via a leaky-max envelope) — `extractFeatures` itself
   stays as the pure RMS-only piece, reused internally, so none of its
   existing tests needed to change. `AudioOrchestrator` now lazily
   constructs one `AudioFeatureExtractor` once the real sample rate is
   known from the first buffer. **Real vcpkg finding:** aubio's default
   `tools` feature pulls in ffmpeg/libflac/libogg/libsndfile/libvorbis —
   installed with it explicitly disabled (`aubio[core]`, 9.5s vs. what
   would have been a from-source ffmpeg build) to keep Core's
   dependency-isolation exception as narrow as originally decided. **Result:
   47/47 core tests passing** (5 new `AudioFeatureExtractor` tests against
   real synthetic signals, not placeholders — a continuous pure tone's
   measured centroid lands within 100Hz of its true frequency, a sudden
   transient after silence reliably triggers `onsetDetected` — + the
   pre-existing 42), `Aurora-App-Windows` rebuilt clean too (4/4, no
   regressions).
3. **Live-capture plugins**, new CMake target in each existing repo (not
   a new repo — see `AudioAnalysis.md`'s repo/target-structure section):
   - **Windows: done, hardware-verified.** `Aurora-Input-Windows` gains
     `AuroraInputWindowsAudio` (new `AURORA_INPUT_WINDOWS_ENABLE_AUDIO`
     option) — `AudioGrabber`, miniaudio-backed WASAPI loopback (verified
     against the real header/docs first: `ma_device_type_loopback`, the
     `ma_device_config` fields, the data-callback signature — same
     discipline as the aubio pass). Push-to-pull adaptation is a
     mutex-protected accumulator filled by miniaudio's real-time callback
     thread, drained by `readNextBuffer()`. Ran the hidden `[manual]` test
     against real hardware immediately (this machine has a real
     interactive desktop, same reasoning as `WindowsGrabber`'s own
     verification): first run produced zero callbacks in 3 seconds with
     nothing playing; re-ran while actually triggering real playback
     (Windows Speech Synthesis) and got real data within ~1s — 48000Hz
     stereo, correctly read back from the negotiated device config, not
     assumed. Confirmed real finding, filed in `Analysis/lessons/input.md`:
     shared-mode WASAPI loopback delivers **zero callbacks, not silent
     ones**, when nothing is actively rendering — informative for future
     diagnostics, not a bug, and not a blocker for the actual use case
     (reacting to music implies something's already playing).
   - **Linux: written, compile-verified, not hardware-verified.**
     `Aurora-Input-Linux` gains `AudioGrabber` under `AURORA_INPUT_LINUX_ENABLE_AUDIO`
     (default on) — direct `pw_stream` capture (no portal needed, unlike
     `PipewireGrabber`'s screen capture) targeting a sink's monitor ports via
     `PW_KEY_TARGET_OBJECT` + `stream.capture.sink=true`, verified against
     real Pipewire example source/docs first. New `Config::audioTargetSinkName`
     (Pipewire has no universal "default sink" alias, unlike WASAPI loopback —
     required, loud failure if unset/wrong rather than silently capturing a
     mic). Built and tested via WSL2 Ubuntu against the real target machine's
     checkout (no toolchain limitation this time) — caught and fixed one real
     bug this way (a C-vs-C++ compound-literal address-of error, see
     `Analysis/lessons/engineering-hygiene.md`). **Still open:** actual
     capture against real hardware (a real sink, `alsa_output.usb-TaiYiLian_
     B03__...-02.analog-stereo` on the test machine) hasn't been run yet, and
     neither has App-Linux's own `Registry`/`main.cpp` wiring (see step 5).
4. **Orchestration — done, Windows-verified.** `AudioOrchestrator` built as
   a separate class, no shared base with `Orchestrator` (same reasoning
   `IAudioInput`/`IVideoInput` already got no shared base — the two
   pipelines share almost no real steps beyond "send `Frame` to each
   `IOutput`"). `Orchestrator` itself is completely untouched. New
   `composeAudioFrame` (Runtime) broadcasts one color to every active zone,
   the audio sibling of `composeFrame`. Deliberately no `Smoother` pass —
   `updateBounce`'s own damping already serves that role; stacking a
   second, independently-tuned easing on top would fight it. Takes an
   explicit `dt` (unlike `Orchestrator::update()`), since drift/bounce are
   genuinely time-integrated. **Result: 42/42 core tests passing** (4 new
   `AudioOrchestrator` tests + the pre-existing 38), `Aurora-App-Windows`
   rebuilt clean too (4/4, no regressions).

   Validated against real VJ software, not just Aurora's own precedent:
   TouchDesigner keeps audio (CHOPs) and video (TOPs) as genuinely separate
   operator families that can't even wire directly together, and Resolume
   treats audio purely as a *modulator* of video parameters rather than a
   parallel output producer — see `AudioAnalysis.md`'s orchestration
   section.

   Takes an `AudioEffectSettings` struct in its constructor (the tunable
   constants — cold-start pair, `smoothTime`, dynamism floor, centroid
   `strength` — as parameters, not hardcoded) so a future settings UI needs
   zero changes to `AudioProcessing`/`AudioOrchestrator` themselves. **Not
   yet done:** the actual `Config` fields to populate that struct from
   don't exist yet — today's tests pass a default-constructed
   `AudioEffectSettings{}` directly. Wiring real `Config` fields is part of
   step 5's app-wiring work below, the same place `activeAudioInputName`
   needs deciding.
5. **App wiring — Windows done, Linux not started.** `Aurora-App-Windows`'s
   `Registry` gained an `IAudioInput` factory map (mechanical) and `main.cpp`
   dispatches on a resolved precedence rule: video wins if
   `activeInputName` is set, audio only runs if it's empty and
   `activeAudioInputName` isn't — a deliberately minimal decision (no mode
   enum, no UI to drive one) rather than the more elaborate design
   originally sketched here. `AudioEffectSettings` is fully `Config`-backed
   now (10 fields, all editable in `config.json` with no rebuild).
   `Aurora-App-Linux`'s `Registry`/`main.cpp` have **none of this yet** —
   `AudioGrabber` exists and builds, but nothing in the app registers or
   selects it. This is the concrete next step once Linux hardware-verifies
   the grabber itself.
6. **Tests — done, including aubio's real onset/centroid paths now.** Per
   step 2's results above: `extractFeatures`'s `rms`, `randomAnchorHue`,
   `updateDrift`, `updateBounce`, and now `AudioFeatureExtractor`'s
   onset/centroid pipeline are all covered with no real audio *hardware* —
   synthetic signals (sine tones, silence-then-transient) stand in for it,
   same spirit as `ImageProcessing`'s tests, done before either live-capture
   plugin exists. Live capture itself stays a hidden/manual test per
   platform, same category as `WindowsGrabber`'s `[manual]` case — depends
   on a real audio session, not something CI can assert on.

**Explicitly deferred, not part of this phase's demonstrable:**
- **`AudioFile-Input`** (provenance 1) — resequenced to a later,
  lower-priority pass as a reproducible test fixture (libsndfile-backed,
  already verified in `AudioAnalysis.md`), not needed for the live-capture
  demonstrable above.
- **Video-embedded audio** (provenance 2) — needs a genuinely different
  joint-demux component, tied to phase 3's still-unscoped video-upload
  idea, not this phase.
- **Building an actual settings UI** — the `Config` fields/`AudioEffectSettings`
  struct from step 4 make the values UI-editable *when* a UI exists, but no
  UI is part of this phase. Unset `fixedAnchorHue` (random pick among the
  six pairs) stays the only exercised path until something actually writes
  to that field.
- Every numeric constant in `AudioAnalysis.md` marked as needing a
  listening test (`smoothTime`, the dynamism floor, centroid `strength`,
  vibrancy S/V) — starting points to tune during this phase's actual
  build, not values to treat as final before real playback exists to
  tune them against.

## Phase 3 — Three.js browser demo, then the native WebUI milestone

Split into two sequenced milestones after a long reasoning pass (see
`Analysis/BrowserAnalysis.md` and `Analysis/DistributedArchitecturePlan.md`
for the full findings this splits from) — a real change from this phase's
original framing as one native `Output::ThreeJS` plugin.

**Milestone 1 (decided shape): a fully self-contained browser demo, no
native backend at all.** The "zero-install, hooks first" front door for the
whole project — nobody downloads a server to try a demo, but a good enough
demo is what gets someone to download the real thing.

**Repo split (2026-09-14):** the demo itself lives in its own new repo,
`Aurora-Demo-Web` — a sharper split than any existing plugin repo, since it
shares no toolchain with core at all (no CMake, no C++, own deploy target).
The one exception is the crop/average math, which is a direct JS mirror of
`Processing`'s C++ logic and stays in `Aurora/web-processing/` specifically
so it sits next to the code it mirrors for drift-checking; `Aurora-Demo-Web`
consumes it by copying the source across for now, not an npm package — worth
revisiting only if keeping the copy in sync becomes an actual pain point.

Four pieces:

- A file-input module (`Aurora-Demo-Web`) — a bundled sample **video, WebM**.
  Documented as "this demo works with WebM" rather than engineered for
  arbitrary-format robustness; if a browser can't decode what's uploaded,
  that failure is the natural upsell moment toward the native app (which
  decodes far more formats via OpenCV) rather than a robustness gap to close
  in the demo itself. **A user-upload option is still not built** (tracked
  on the demo's own README "Not yet built" list, confirmed 2026-09-15) — the
  bundled sample is the only video source today.
- A web `Processing` module (`Aurora/web-processing/`, copied into
  `Aurora-Demo-Web`) — hand-ported crop/average math (JS), per
  `BrowserAnalysis.md`'s reuse-vs-reimplement finding for that specific
  logic.
- A Three.js virtual-light output module (`Aurora-Demo-Web`) — the original
  9-slice-grid concept (8 `Three.js` point lights around the video plane,
  center discarded) shipped first, then was superseded as the demo's default
  scene by a full 3D room (`TV_Room.glb`, credited in the demo's README) with
  its own zone map assigning lights to the model's fixtures. The original
  flat/grid scene still exists in code (`buildStaticScene` in `main.js`) but
  its UI picker is hidden pending the XR pass (2026-09-15) — see
  `rendering-internals.md`/`rendering-apis.md` for the Three.js-specific
  lessons from building it.
- The Three.js scene itself the lights live in (`Aurora-Demo-Web`).

**Audio shipped (2026-09-15), superseding the "deferred" plan originally
here.** Neither alternative this section used to name was actually used: a
real WASM build of `AudioFeatureExtractor` was ruled out (Emscripten's own
toolchain cost, not a capability gap), and the third-party `BeatDetector`
library was evaluated against its real source and rejected (only a boolean
on-beat signal, no `onsetStrength`/`rms`/`spectralCentroid`, deprecated APIs,
unmaintained since 2015). What shipped instead is a hand-rolled JS port
(`Aurora/web-processing/audioFeatures.js` + `colorModel.js`) of native's own
`AudioFeatureExtractor`/`AudioProcessing` math, test-driven against native's
own Catch2 suites ported line-for-line to `.test.mjs`. An A/B/C/D tuning pass
against the ported native defaults settled on a "tuned" preset (faster
brightness smoothing than native's own bulb-tuned defaults — see
`engineering-hygiene.md`'s brightness-lag-reads-as-boring finding) as the
shipped default; a demo-only attack/decay variant was built and deliberately
kept out of the tested port. Full detail in `AudioAnalysis.md` and
`BrowserAnalysis.md`, including a tracked-but-not-started follow-up to
backport the same A/C tuning finding to native Windows/Linux (already
possible with zero code changes, since `Config` already persists every
relevant field).

**Considered and cut: a rougher, real-bulb-driving output using Hue's CLIP
v2 REST API directly from the browser**, bypassing the Entertainment
API's UDP/DTLS stream. Cut because the premise doesn't survive contact
with how browsers actually work, not for lack of interest: the whole
appeal was reaching real bulbs *without* needing the native app running at
all, but the Hue bridge doesn't grant CORS access to arbitrary public
origins (confirmed, not assumed — see `BrowserAnalysis.md`), so a page
hosted anywhere public (GitHub Pages included) can't reach a bridge
directly regardless of Chrome's Local Network Access rollout. Some native
process has to run locally either way to bridge that CORS gap — and once
any native involvement is required at all, there's no reason to build a
CLIP-only relay when the existing native app already does the real,
better thing (DTLS streaming) unmodified. A hail-mary search for prior
art turned up real projects (`jsHue`, `Kingfish`) claiming direct
browser-to-bridge control, but each one sidesteps the wall by using the
older, plain-HTTP Hue API v1 from a non-HTTPS context — not a solution to
the case that actually matters (a public HTTPS-hosted page), just a
different setup that avoids the same wall by not standing in it.

**Milestone 2 (next, after milestone 1 ships): the native-facing WebUI.**
This is this phase's *original* scope, now sequenced deliberately after
the demo rather than built first — a real native setup/pairing/zone-mapping
UI is the current weak link in the funnel (someone sold by the demo today
lands on env-var Hue configuration, no GUI), and building the demo first
validates the funnel's front door before investing in the back half.

**Corrected premise (2026-09-15):** verified there is no existing HTTP server
or setup WebUI anywhere in Aurora's core or app repos today — no
`Network::Http::Server`/`HttpLibServerImpl`-shaped code exists, and
`Analysis/HttpServerAnalysis.md` was never actually written. This section
used to read as "extend the existing httplib-based server (already present
for the setup WebUI)" — that described **huenicorn's** own server
(`SetupBackend`/`WebUIBackend`, `webroot/`), which Aurora's module-split
rewrite never carried forward. This milestone is new
infrastructure, not an extension of anything Aurora already runs — huenicorn's
implementation is still the right template to follow closely (same
cpp-httplib version even, `v0.46.0`), just not something already wired into
this codebase.

- **Analysis pass done (2026-09-15): `Analysis/HttpServerAnalysis.md`.**
  Covers huenicorn's real `Network::Http::Server` C++ implementation (read
  directly — `HttpServer`/`Impl`/`SetupBackend.cpp`/`Runtime.cpp`, not just
  the JS frontend), its threading model (a dedicated server thread separate
  from the tick-loop thread, synchronized via a `promise`/`future` ready
  signal), a real concurrency gap in huenicorn worth not copying (only its
  DTLS streamer is mutex-guarded, per-channel settings state isn't), and the
  one real design fork Aurora needs beyond huenicorn's in-place-mutation model
  (full pipeline reconstruction on a settings change, needing one consistent
  lock around a swappable "current pipeline" unit). Not needed for milestone 1
  at all (no native backend in that shape) — this was purely a milestone-2
  prerequisite.
- **Screen list, jobs-to-be-done, and component research: see
  `Analysis/WebUI/WebUI_Design_1stPass.md`.** Covers the full screen breakdown (Output
  Connect, Mode+Device Select, Zone Mapping, Tuning/Settings, Dashboard), the
  hub-and-spoke navigation model (RockyRoad's `App.ts`/`#screen-container`
  shell pattern, not a forced linear wizard for returning users), and per-screen
  component recommendations grounded in actually-read huenicorn/RockyRoad
  source (huenicorn's `ScreenWidget.js` for zone mapping, RockyRoad's
  `TunerScreen.ts`/`Dropdown.ts`/`RockyRoadImport/SongConverter` forms page for
  device-select and settings), plus the design-token drift, keyboard/ARIA, and
  mouse-touch-to-XR findings that came out of that research.
- **Native side, three surfaces, not one:**
  - *Preview streaming* (the original plan here, still technically valid but
    **deliberately last in build order, not first** — see
    `Analysis/WebUI/WebUI_Design_1stPass.md`'s Build order section: the Dashboard's live
    preview and per-zone swatch row were cut from v1 entirely, so nothing
    consumes this endpoint yet): a chunked MJPEG endpoint serving the
    already-downsampled preview frames (JPEG-encode the same small
    `ImageData` already computed for color sampling via OpenCV's `imencode`
    — already a dependency) plus a Server-Sent Events endpoint pushing each
    tick's `Processing::Frame` as JSON.
  - *Settings/mode*: REST endpoints over `Config`'s already-clean user-facing
    fields (`activeInputName`/`activeAudioInputName`/`activeOutputNames`,
    `refreshRate`/`subsampleWidth`/`interpolation`/`transitionSmoothing`,
    `audioTargetSinkName`, and the full audio-effect-tuning block). The
    audio/video mode toggle specifically needs **no CMake change** — it's
    already just two `Config` string fields
    (`Aurora-App-Windows/src/main.cpp:141-144`'s `useAudioMode` derivation);
    CMake flags only gate whether a plugin is compiled in at all. What's
    actually missing is a live-reload path: everything (`Config`, `ZoneMap`
    via `reconcileZoneMap`, called only inside `Orchestrator::init()`) is
    currently derived once at process start, with no `SIGHUP`/watch
    mechanism anywhere. Build one generic reload entrypoint (tear down and
    reconstruct Input/Output/Orchestrator from a freshly-loaded
    `Config`+`ZoneMapStore`) that every settings PUT funnels into, rather
    than special-casing the mode toggle alone — the same mechanism then
    picks up any `Config` edit without a full process restart.
  - *Hue pairing*: currently a real gap, not just missing UI — both app
    repos' `registerOutputs()` require three env vars
    (`AURORA_HUE_BRIDGE_ADDRESS`/`_USERNAME`/`_CLIENTKEY`) set at process
    start, and the code's own comment says outright "no pairing flow exists
    yet"; `hue` output is simply unavailable otherwise. None of
    `HueOutput`'s real needs (`Credentials{username, clientkey}` +
    `bridgeAddress` + optional `entertainmentConfigurationId`) are persisted
    in `Config` today, by design. This milestone needs new persisted storage
    for those fields plus a pairing wizard — huenicorn's own wizard
    (autodetect/manual IP → physical push-link button → confirm) is a
    directly reusable *flow* to follow given how closely the field shapes
    already match, even though the implementation language differs.
  - *Zone mapping*: Aurora's own `ZoneConfig` (`zoneId`, `uvs` min/max rect,
    `active`, `gamma` — `core/Runtime/include/Aurora/Runtime/ZoneMap.hpp`) is
    structurally identical to huenicorn's per-channel model, so huenicorn's
    drag-resize SVG UV canvas (`ScreenWidget.js`) is a highly portable
    interaction pattern for video-capture zone setup. It has no equivalent
    for audio mode, since `AudioOrchestrator` broadcasts one color to every
    zone with no spatial concept at all — that screen needs to stay
    hidden/inactive whenever audio mode is selected, the same "hide from UI,
    keep in code" pattern the browser demo already uses for options that
    don't apply to the current mode.
  - HTTPS is available cheaply if/when phase 4 needs it: cpp-httplib
    `v0.46.0` (huenicorn's exact pinned version) already supports
    `CPPHTTPLIB_MBEDTLS_SUPPORT`, and huenicorn already links
    `mbedtls`/`mbedx509`/`mbedcrypto` for its DTLS bridge client — serving
    real HTTPS costs a compile define and a cert, not a new dependency. See
    phase 4 below for why it'd be needed at all.
- New `Output::ThreeJS` module implements `IOutput`; `send()` forwards the
  `Frame` to connected SSE clients. **Already true, not still needed:**
  `Orchestrator`/`AudioOrchestrator` already take a `vector<IOutput*>` and
  broadcast to all of them (phase 2.5's audio work exercised this directly),
  not huenicorn's single `m_streamer` — Hue and the browser preview running
  simultaneously needs no further `Runtime` change.
- **Browser side** (repo TBD — unlike milestone 1, this needs a live
  connection to the native server, so `Aurora-Demo-Web`'s "zero native
  backend" repo-split reasoning doesn't automatically transfer; revisit when
  milestone 2 actually starts): a Three.js page rendering the MJPEG preview
  as a plane/texture, subscribing to the SSE endpoint, drawing each zone as a
  colored 3D element positioned by its UV on the video plane, plus the
  settings/pairing/zone-mapping screens above (no framework/component-library
  dependency needed for these — see phase 4's RockyRoad note below on what is
  and isn't actually reusable there).
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
  milestone 2's browser client from it (repo TBD, see above). The Windows/Vite/IWSDK setup gotchas and the local-Z
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
- **UI-toolkit checked too, not just engine scaffolding (2026-09-15).**
  RockyRoad has no importable component library — `v2/src/desktop/` and
  `v2/ui/*.uikitml` are both app-internal (`"name": "Rocky Road"`,
  `"private": true`, relative imports only), so no package/workspace/submodule
  path makes sense here. What *is* reusable is the pattern: RockyRoad
  hand-authors each widget twice, once as DOM/CSS
  (`v2/src/desktop/Dropdown.ts`) and once as a `.uikitml` XR panel
  (`v2/src/xr/OptionDropdown.ts`), sharing a documented token set (spacing
  translated 1:1 between `src/xr/panel.css` and the desktop CSS, a 3-step
  hover/active color-escalation convention per button variant, e.g.
  `.primary-dark`'s `#333333` → `#515151` → `#7c7c7c`). Worth copying that
  *authoring pattern* for Aurora's own WebUI widgets (author once as DOM,
  once as uikitml, from one shared token set) rather than trying to import
  RockyRoad code — there's nothing packaged to import.
- **Secure-context prerequisite actually lands in milestone 2, not here
  (2026-09-15).** WebXR requires a secure context (HTTPS); localhost is
  exempt the same way other secure-context APIs are, so on-machine dev needs
  nothing extra, but a real headset hitting the daemon over LAN by IP is not
  localhost and needs a genuinely trusted cert. Milestone 2's server already
  covers the capability side cheaply (cpp-httplib + huenicorn's existing
  mbedtls link, see above); the remaining gap is cert-trust *distribution* to
  a headset, which Vite's `vite-plugin-mkcert` automates in RockyRoad's own
  dev setup and cpp-httplib has no built-in equivalent for. Worth a small
  analysis pass of its own once milestone 2 actually reaches this point, not
  solved here.
- **License note:** this reuses RockyRoad's engine scaffolding (GPLv3, itself
  carried from ChartPlayer) — already compatible with Aurora's own GPLv3
  (carried from huenicorn), just worth stating explicitly in that repo's own
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
- Use `interactive-shader-format-js` in milestone 2's Three.js scene, rather than
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
  Not needed for phases 1–5 to work end to end. **This is also the fork
  where the open one-seam-vs-double-seam question in
  `DistributedArchitecturePlan.md` needs an actual answer** — pick it up
  again when this stretch goal gets picked up, not before.
- **Object detection (YOLO-style)** — designed in `OpenFormatsResearch.md`, not
  part of this pass; slots into `Processing` after phase 5.
- **Additional Output targets** (DMX/Art-Net/sACN, OPC/DDP) — deferred the same way.
- **Dynamic/hot-swappable plugin loading** — only revisit if compile-time module
  selection actually becomes a real pain point (e.g. wanting one binary to
  support many outputs without recompiling).