# Implementation plan: phases 1, 2, 2.5 (native build)

Id: implementation-plan-early-phases

Status: shipped — Phase 1 (Aurora-4li, 2026-09-13), Phase 2 (Aurora-m4f,
2026-09-14), Phase 2.5 (Aurora-ljj, 2026-09-15), all closed. Split out of
docs/planning/ImplementationPlan.md (Aurora-d8g) — the roadmap itself is
[[implementation-plan]]; directory layout is
[[implementation-plan-directory-layout]]; Phase 3 is
[[implementation-plan-phase-3]].

## Phase 1 — Refactor into three modules; Linux input + Hue output plugins

Pure restructuring, zero new features. **Demonstrable:** the restructured app
captures the Linux screen and drives real Hue lights exactly like huenicorn does
today — this is the regression check everything else builds on.

1. **Analysis pass first.** Three docs, each covering its section holistically
   before any code moves. **All three done:** `docs/archive/ProcessingAnalysis.md`
   (the `Contracts` vs `Processing` split, three real bugs found during the
   read/port), `docs/archive/HueOutputAnalysis.md` (the pure-vs-I/O split that
   scoped that pass, the `Contracts::Frame` naming correction, the
   SSL-verification-disabled constraint worth carrying forward carefully), and
   `docs/archive/LinuxCaptureAnalysis.md` (why X11 ports now but Pipewire doesn't,
   a fourth bug found — `_divisors()`'s off-by-one — and the `IInput`
   refinement it drove). `archive/FirstScan.md` already covers the interfaces at a
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
   `archive/ModuleSplitPlan.md`), and started `Aurora-Input-Linux` as its own repo
   (repo-split decision, same doc). Ported and tested `DummyGrabber` and the
   session-dispatch decision logic (`SessionDispatch`); mechanically ported
   `X11Grabber` (builds, needs a real X11 session to manually verify
   capture). Mechanically ported `PipewireGrabber`/`XdgDesktopPortal` too —
   1091 lines of D-Bus/GLib glue, but this pass found two genuinely pure,
   testable pieces inside it (gamescope node matching, raw-buffer-to-
   `ImageData` conversion) that the first scoping pass hadn't surfaced.
   Builds cleanly against real `libpipewire`/`gio` dev packages; still needs
   a real Wayland session to manually verify capture — tracked in
   `archive/LinuxCaptureAnalysis.md`.
4. **Done.** Introduced the `Processing` module (plus, as it turned out,
   `Contracts` underneath it — see `archive/ModuleSplitPlan.md`): moved
   `ImageProcessing` into `Aurora::Processing`, and `Color`'s generic parts
   (`toNormalized()`/`brightness()`) plus `ImageData`/`UV`/`Interpolation`
   into `Aurora::Contracts`. Per the earlier gamma decision, `Color::toXYB()`
   was **not** ported here — see step 5, it landed in `Aurora-Output-Hue`
   instead, as a free function; `Color` in `Contracts` has no Hue-shaped
   method on it at all now, by construction, not just convention.
5. **Done.** Introduced `IOutput` in Aurora core (header-only interface
   target, no `Config*` param, later gaining `zoneIds()` — see
   `archive/ModuleSplitPlan.md`/`archive/RuntimeAnalysis.md`), and started
   `Aurora-Output-Hue` as its own repo (repo-split decision, same doc).
   Ported and tested `toXYB()`, `Channel`, `HuestreamHeader`/`HuestreamPayload`,
   `sanitizeBridgeAddress`, `Credentials`'s byte-conversion first (everything
   pure), then the full I/O layer once `Config`/`Runtime` existed:
   `HttpClient` (libcurl), `ApiTools`, `EntertainmentConfigurationSelector`,
   `DtlsClient`/`MbedTlsImpl` (Mbed TLS), `Streamer`, and finally
   `HueOutput : IOutput` itself — see `archive/HueOutputAnalysis.md`'s staged
   follow-up pass. Genuine I/O still needs a live bridge to verify
   end-to-end, same category as `X11Grabber`.
6. **Done.** `Contracts::Frame`/`Zone` — the neutral Input→Processing and
   Processing→Output contract (renamed from the `Processing::Frame` this step
   originally described — see `archive/ModuleSplitPlan.md`'s naming correction).
   Minimal v1 shape (zone id + linear color); positions/effects/detections
   aren't needed until phases 3 and 5.
7. **Done against fakes; `HueOutput` now exists too (step 5), so real
   plugins can be wired in next.** Built `Runtime::Orchestrator`, depending
   on both `IInput`/`IOutput`, tested with a `FakeInput`/`FakeOutput` pair
   standing in for `Input::Linux`/`Output::Hue` — see `archive/RuntimeAnalysis.md`'s
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
  (`docs/archive/WindowsInputAnalysis.md`) on what `IInput` actually requires of an
  implementer plus DXGI Desktop Duplication's real API shape (frame
  acquisition, format, the resize/re-acquire lifecycle) verified against
  Microsoft's docs before coding against assumed behavior — not a full
  conversion-analysis doc since nothing's being converted.
- **Done.** Implemented `IInput` as `WindowsGrabber` using **DXGI Desktop
  Duplication**, built and hardware-verified — see the narrative paragraph
  above and `archive/WindowsInputAnalysis.md`'s hardware-verified-pass section.
- Already fixed, not phase 2's doing: `ImageProcessing::Algorithms::mean()`
  already honors `PixelFormat` per-channel (done as part of phase 1's
  `archive/ProcessingAnalysis.md` finding 1) — the stale claim that phase 2 would be
  the moment to fix it has been corrected in `archive/WindowsInputAnalysis.md`.
- **Done.** The same app, built on Windows (`Aurora-App-Windows`), capturing
  the Windows desktop and driving real Hue lights through the unchanged
  `Output::Hue` plugin — confirmed live against the real bridge. See the
  narrative paragraph above.
- Confirmed real, not just a planning-stage concern (see
  `docs/lessons/input.md`): a non-blocking `AcquireNextFrame` poll can
  starve on placeholder frames forever, and a monitor Windows still lists as
  attached can be genuinely powered off with no API-level way to detect it.

## Phase 2.5 — Audio input & processing

Inserted between phases 2 and 3, not phase 6, because it's independent of
phases 3–5 (browser/WebXR/ISF) — it's a new `Input`+`Processing` track,
the same kind of foundational native work as phase 2, not something
gated on or by the browser output work. **Analysis pass already done,
extensively:** `docs/archive/AudioAnalysis.md` — every decision below is
sourced from it rather than re-derived here.

**Demonstrable:** play music through whatever the user normally uses
(Spotify, browser, anything), watch real Hue lights bounce between a
vibrant complementary color pair on the beat, the pair itself slowly
rotating in hue over time, nudged by the track's own spectral content —
confirmed live against real hardware, same rigor as phase 2's real
end-to-end verification.

**In scope for this phase — live capture only** (provenance 3 in
`archive/AudioAnalysis.md`'s breakdown), because it's the only provenance that
lets tuning happen by ear without also building audio playback:

**Unplanned, discovered mid-phase: X11/Pipewire pixel-format mistagging,
found and fixed.** A huenicorn-vs-Aurora color-accuracy comparison on
real hardware turned up wrong colors (blue scenes green/pink, red scenes
blue). Root cause: `X11Grabber` tagged captures `RGBA` when the real X11
memory layout is `BGRA` (ported verbatim from huenicorn, harmless there
since its `mean()` ignored the tag entirely; became live once Aurora's own
port made that code format-aware). Same class of bug existed in
`PipewireFrameBuffer.hpp`. Fixed and **confirmed on real hardware** --
colors now match huenicorn. See `docs/lessons/input.md`.

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
   `Config`-parameterization decided earlier), per `archive/AudioAnalysis.md`'s
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
   a new repo — see `archive/AudioAnalysis.md`'s repo/target-structure section):
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
     assumed. Confirmed real finding, filed in `docs/lessons/input.md`:
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
     `docs/lessons/engineering-hygiene.md`). **Still open:** actual
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
   parallel output producer — see `archive/AudioAnalysis.md`'s orchestration
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
  already verified in `archive/AudioAnalysis.md`), not needed for the live-capture
  demonstrable above.
- **Video-embedded audio** (provenance 2) — needs a genuinely different
  joint-demux component, tied to phase 3's still-unscoped video-upload
  idea, not this phase.
- **Building an actual settings UI** — the `Config` fields/`AudioEffectSettings`
  struct from step 4 make the values UI-editable *when* a UI exists, but no
  UI is part of this phase. Unset `fixedAnchorHue` (random pick among the
  six pairs) stays the only exercised path until something actually writes
  to that field.
- Every numeric constant in `archive/AudioAnalysis.md` marked as needing a
  listening test (`smoothTime`, the dynamism floor, centroid `strength`,
  vibrancy S/V) — starting points to tune during this phase's actual
  build, not values to treat as final before real playback exists to
  tune them against.
