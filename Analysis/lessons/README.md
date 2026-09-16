# Lessons learned — index and filing rules

Gotchas, non-obvious findings, and hard-won decisions that aren't obvious from reading
the code or planning docs. Add here whenever something costs more than 30 minutes to
diagnose.

**This directory is the only lessons-learned location in the repo** — for huenicorn
work and for the Input/Processing/Output split alike. Don't start a new
`LessonsLearned.md` elsewhere; if unsure whether one already exists, `find . -iname
"*lesson*"` first.

Modeled on [RockyRoad's lessons structure](../../../RockyRoad/Analysis/lessons/README.md)
(see `Analysis/lessons/README.md` there) — same filing/splitting rules, scoped to
Aurora's own module boundaries instead of RockyRoad's. `rendering-apis.md` vs.
`rendering-internals.md` specifically mirrors RockyRoad's own `engine/runtime-apis.md` vs.
`engine/xr-3d-rendering.md` split (third-party API facts vs. this project's own design calls).

## Index

- [`engineering-hygiene.md`](engineering-hygiene.md) — general design/build-tooling
  principles: CTest's `enable_testing()` scoping, an original "don't build on
  a Windows-mounted drive from WSL2" finding later superseded by many
  successful direct `/mnt/d` builds in this same project (plus the git
  safe-directory corollary, still real) — with a narrower, still-live risk at
  `FetchContent`'s own extract/rename step (a transient Permission Denied,
  fixed by deleting the build dir and retrying after a short pause),
  `using namespace` not resolving a sibling namespace's own name (recurred
  once already — treat as a checklist item), relative-path casing across
  Windows/Linux, `FetchContent`-ed subproject CACHE variable collisions,
  environment-selected variants (X11 vs. Wayland) being one plugin with
  backends rather than separate plugins, not porting a logger early costing
  real diagnostics twice over, `FetchContent_Declare(... URL ...)`
  needing `DOWNLOAD_EXTRACT_TIMESTAMP` (plus checking sibling fetch blocks
  for the same gap, since an unexercised fetch path hides it), classifying a
  "generic vs. plugin-specific" field by where it's authored rather than
  where its formula is applied (the gamma-storage gap), a distro dev package
  lacking the `.pc` file its own `pkg_check_modules` call assumed (Mbed TLS
  2.28 vs. 3.6.5), an interface method's return value silently doubling as a
  persisted file path (`IOutput::name()` → `profiles/<name>.json`, case
  included), distrusting a run's own evidence once it contradicts the
  real-world outcome rather than re-reading the same artifact, and an
  installer's `--quiet`/`--passive` flag silently requiring the shell be
  pre-elevated rather than prompting for UAC itself (VS Installer exit 5007),
  that same workload finishing successfully without putting `cmake`/
  `cl.exe` on `PATH` (use the bundled CMake's full path; use CMake's Visual
  Studio generator to avoid needing `vcvars64.bat` for the compiler at all),
  a directory's ACLs outliving a machine-identity change and denying an
  account that looks like the same one (compare SID prefixes, not names),
  and a stray IDE-generated `vcpkg.json` silently switching CMake's vcpkg
  toolchain into manifest mode and resolving an ABI-incompatible compiler
  (`-DVCPKG_MANIFEST_MODE=OFF` forces classic mode back), a vcpkg port's
  default features pulling in a much heavier dependency tree than expected
  (aubio's default `tools` feature wanting ffmpeg; `[core]` avoids it), a
  process started from this Bash environment reporting a different PID
  than Windows sees, needing `/F`/image-name `taskkill` to stop reliably,
  and a C library's own example code taking the address of a compound
  literal — a legal lvalue in C, an illegal prvalue in C++, two modes
  producing the same surface symptom (colors clustered on a wheel) for
  completely different reasons — diffing the wrong mode's pipeline against
  a reference can look thorough and come back clean at every step without
  ever being the actual explanation, `AnalyserNode`'s frequency-domain
  getters returning dB with internal smoothing baked in rather than linear
  magnitude (checked the real spec, not assumed), and a synthetic DSP test
  signal needing the same preprocessing (windowing) the real pipeline
  applies, or a correct implementation can still fail its own test, and
  brightness lag reading as "boring"/unreactive in a beat-driven light
  response far more than hue lag does, when A/B-tuning smoothing time
  constants, and a prebuilt vcpkg binary (`Catch2d.lib`) being ABI-incompatible
  with a very new Windows SDK/MSVC toolset, surfacing as `__std_*` unresolved
  externals that survive deleting a project's local `vcpkg_installed` since
  binary caching re-serves the same stale artifact, a bare `std::thread`
  manually joined only at the tail of `main()` calling `std::terminate()` on
  any earlier `return` path, caught only by actually running the early-return
  branch rather than by compiling, a static-file mount point silently
  shadowing a registered API route at the same path since cpp-httplib checks
  the mount first for GET/HEAD (confirmed by reading its real dispatch order,
  not assumed), this environment having no headless-browser tool — jsdom
  against the real on-disk files, installed dev-only outside the repo, is the
  substitute for exercising real DOM/JS behavior instead of code review alone
  — a live end-to-end test against a real endpoint needing a settle time
  sized to the system under test's own configured timeouts (a 1s server-side
  curl timeout to `discovery.meethue.com`), not to how fast a mocked-fetch
  test resolves, and a library's own "register everything before X" contract
  (`HttpServer`'s routes-before-`bind()` rule) forcing a slow dependency's
  construction earlier than it used to happen, with a real ~1.5-2s startup-
  latency cost only measured by polling, not visible from reading the diff,
  a "reset to auto" sentinel (`subsampleWidth: 0`) getting silently
  overwritten by the very reload its own save triggers before the next read
  ever sees it, before copy-pasting a "had to duplicate this per app"
  pattern onto a new route re-checking whether the constraint that forced it
  (an app-layer-only type) actually applies this time, and before routing a
  new mutation through the same reload machinery everything else uses,
  checking whether the data is already live in memory outside that
  machinery (`ZoneMap` bypassing `Config`+reload entirely for this reason),
  and `npm install <newpkg>` in a directory with no `package.json`
  silently deleting packages a previous ad hoc `npm install` put there
  (jsdom and Playwright evicting each other in the scratchpad until a real
  minimal `package.json` was added to resolve both together), a
  build-log doc's own per-step entries each being individually accurate
  and complete not guaranteeing the whole document stays readable --
  `WebUIAnalysis.md`'s build order grew unskimmable once verification
  detail was recorded in full every step, and outgrew being safely
  restructured by the time that was attempted; a redirected process's
  stdout buffering differently than console-attached stdout, making a
  live, working process look identical to a crash in an empty log file;
  and a write endpoint requiring a full object round-trip breaking the
  moment its paired read endpoint withholds part of that object from the
  client for security (`/api/hue/connection` needing PATCH semantics once
  a second caller only wanted to change one already-persisted field).
- [`rendering-apis.md`](rendering-apis.md) — third-party Three.js/GLTFLoader/Blender-export
  facts: `RectAreaLight` having no `distance`/`decay` at all (coupling brightness to reach),
  Blender's glTF export dropping light data unless "Punctual Lights" is checked (and never
  exporting Area lights at all), a glTF material being shared by reference across every mesh
  that uses it (clone before giving one instance independent state), and `alphaMode: BLEND`
  setting `depthWrite = false` alongside `transparent = true` in GLTFLoader (undoing only the
  visible property leaves a material opaque-colored but still see-through).
- [`rendering-internals.md`](rendering-internals.md) — this project's own Three.js scene design,
  demonstrated via `Aurora-Demo-Web`'s TV/room demo: falloff shape and a hard visual boundary
  being two separate jobs (the latter needs a mask, not tighter falloff), matching apparent
  size across two camera depths needing the distance *ratio* not a flat world-space offset,
  and a texture's `rotation` sign not being safely derivable by hand — verify with one real
  render instead.
- [`output.md`](output.md) — streaming/protocol gotchas: a bridge having more
  than one entertainment configuration over the same lights being normal,
  not an edge case (empty-ID auto-select isn't "the only one"),
  `DtlsClient`'s handshake failure being swallowed by design so a clean
  `HueOutput::init()` isn't proof a connection exists, and a reference
  implementation's dead code (huenicorn's own unused `Color::toXY()`) being
  mistaken for its live behavior during a port, sending real streaming
  colors in the wrong wire colorspace (XYB instead of RGB) as a result.
- [`input.md`](input.md) — capture/grabber gotchas: a non-blocking poll on an
  event-driven capture API (DXGI's `AcquireNextFrame`) starving on empty
  placeholder frames forever instead of ever returning real data, a
  monitor Windows still lists as attached (DWM even actively presenting to
  it) being genuinely powered off with no API-level way to detect that,
  shared-mode WASAPI loopback delivering zero callbacks (not silent ones)
  when nothing is actively rendering, a pixel-format tag ported
  verbatim from huenicorn (X11 `RGBA`, really `BGRA`) staying harmless
  there (nothing read it) until Aurora's own downstream code became
  format-aware and started trusting it, PipeWire's daemon answering
  queries fine while zero real audio device nodes exist because the
  session manager (WirePlumber) wasn't installed at all, the installed
  SPA/PipeWire dev headers lacking API the code was written against
  (`raw-utils.h`, `spa_json_object_find`) even though `pkg-config`
  confirmed the package was present, and a second `pw_core_sync` added to
  fix a discovery race exposing a dormant dangling-listener segfault (a
  core-connection listener registered against a stack-local event struct,
  never removed), and WSL2 having no real X11/Wayland session, so
  `aurora-app-linux`'s auto-selecting "linux" input throws there rather than
  degrading gracefully -- pin `activeInputName` to `"dummy"` for any WSL2
  runtime test that reaches input construction.
- [`processing.md`](processing.md) — color/effect transform and zone-mapping
  gotchas: a periodic test signal (a sine wave) regenerated fresh per call
  instead of continuing its phase injecting broadband noise at each call
  boundary, skewing a spectral measurement in a way a relative-comparison
  test alone didn't catch, and a reference implementation's own missing
  corner-vs-opposite-corner clamp (huenicorn's real `ScreenWidget.js`)
  being harmless there but a real `cv::Range` crash risk once the same
  data reached `ImageProcessing::getSubImage` — verifying a reference
  implementation does what it's described to do doesn't by itself prove
  its output is safe for a *different* downstream consumer's own
  assumptions.
- [`web-ui.md`](web-ui.md) — WebUI design-process gotchas: a described
  "existing component" being a claim to verify by reading the real source
  rather than a fact to build on, a layout lesson learned in one constrained
  context (a fixed, ray-pointer-driven XR panel) not transferring to another
  (a phone-width web page) without checking the actual numbers, component-reuse
  research answering "could we" rather than "does the job need this," a
  flagged UI gap already being covered by a normal-path action elsewhere in
  the same flow, a style written ahead of its first real consumer (the
  status-pill) silently drifting from the very precedent it cited since
  nothing exercises unused CSS, a reference ARIA interaction pattern
  ("select follows focus") needing deliberate adaptation once its commit
  callback has real side effects instead of being a free value assignment,
  and this plan doc's own sections drifting out of sync with each other as
  steps get built out of drafting order (recurred four times now across
  five build-order steps — treat as a checklist item) -- a flow diagram
  implying a nav target its own Dashboard mockup never listed, a
  component-inventory row's screen attribution going stale unnoticed for
  several steps, and the Dashboard's own layout mockup keeping a "Pause"
  button and a "Streaming" status claim after the doc's own later sections
  had separately cut/invalidated each one; a fully-green jsdom suite
  being proof a screen's logic works, not proof it renders or behaves
  correctly, since jsdom does no real CSS/SVG layout or hit-testing —
  a real-Chromium QA pass on already-jsdom-tested screens found an SVG
  viewBox's deliberate non-uniform stretch turning circular drag handles
  into ellipses and squishing text, a centered interactive badge silently
  swallowing clicks meant for the element beneath it, and a responsive
  flex rule verified against only a one-button case silently breaking for
  a two-button case of the same container; and a distinct, non-jsdom-
  capability coverage gap in that same Dropdown's own ARIA suite --
  `_commit()` never updated its own label/`aria-selected`, and every
  existing assertion checked either the initial state or that browsing
  doesn't corrupt it, never "committing a genuinely different value
  updates the display," a transition category the suite structurally
  never exercised despite being fully green.

## Where a new lesson goes

1. About *my own* verification/reliability habits, not code/design? → persistent
   memory (`feedback_*`), not the repo.
2. General software-design principle, demonstrated by a real bug here? →
   `engineering-hygiene.md`.
3. Capture/grabber/platform-adapter specific? → `input.md`.
4. Color/effect transform or zone-mapping specific? → `processing.md`.
5. Streaming/protocol/wire-format specific (Hue or any other target)? → `output.md`.
6. A third-party rendering fact (Three.js/GLTFLoader/Blender-export behavior), not this
   project's own design? → `rendering-apis.md`. This project's own 3D-scene design/technique,
   demonstrated by a real bug? → `rendering-internals.md`.
7. Cross-cutting entry? File under whichever module *constrains the fix*, not
   whichever exhibited the symptom — e.g. a `PixelFormat` tag being ignored crashing
   an Output-side assumption files under `processing.md` (that's where the tag is
   produced/consumed), not `output.md` (where the symptom showed up). Cross-list in
   the other file's entry if genuinely two-sided.
8. A WebUI screen/flow design or component-reuse-research finding (not a
   rendering fact, not general build/tooling)? → `web-ui.md`.
9. Destination file too long to skim (rough proxy: 15+ entries)? Split along a finer
   cut of the same module (e.g. `input.md` → `input/capture-backends.md` +
   `input/pixel-formats.md`, each directory getting its own `INDEX.md`, same shape as
   RockyRoad's `ui-toolkit/`/`engine/`). Then update: that file's own index if it
   becomes a directory, any other lesson entry or code comment pointing at the old
   filename, and this list.

Tied to now-removed code? Keep the principle if it still applies, drop the dead
specifics, and say the origin is historical.

## Entry format

A `##` headline stating the general, reusable principle, a short paragraph of what
actually happened (root cause), then a bolded **Fix:** line. See RockyRoad's
`engineering-hygiene.md` for worked examples of this shape.

## Skills

No skills route to this tree yet (Aurora has no `.claude/skills/` yet). Once real
work starts, add skills mirroring RockyRoad's per-bucket lesson skills so this
actually gets checked during work, not just archived after the fact.
