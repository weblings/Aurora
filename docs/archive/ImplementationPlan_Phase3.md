# Implementation plan: Phase 3 — Three.js browser demo, then the native WebUI milestone

Id: implementation-plan-phase-3

Status: milestone 1 shipped 2026-09-14 (Aurora-xcb, closed). **Milestone
2 as originally designed here was never built and is superseded, not
just stale** — corrected 2026-09-29 during Aurora-d8g. Its "native-facing
WebUI" plan (chunked MJPEG preview endpoint + a Three.js browser client
rendering zones) is not what shipped; `Aurora-x7o` (which tracked this
milestone) closed 2026-09-28 as agent-proposed scaffolding the owner
never actually committed to. The real native WebUI — Settings/Pairing/
Zone-mapping over plain REST, an accordion Dashboard, no live
MJPEG/SSE preview — shipped through a completely different, unplanned
track: [[webui-design-1st-pass]], [[webui-design-2nd-pass]],
[[webui-fixes]]. Split out of docs/planning/ImplementationPlan.md
(Aurora-d8g) — the roadmap itself is [[implementation-plan]].

Split into two sequenced milestones after a long reasoning pass (see
`docs/archive/BrowserAnalysis.md` and `docs/archive/DistributedArchitecturePlan.md`
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
  `archive/BrowserAnalysis.md`'s reuse-vs-reimplement finding for that specific
  logic.
- A Three.js virtual-light output module (`Aurora-Demo-Web`) — the original
  9-slice-grid concept (8 `Three.js` point lights around the video plane,
  center discarded) shipped first, then was superseded as the demo's default
  scene by a full 3D room (`TV_Room.glb`, credited in the demo's README) with
  its own zone map assigning lights to the model's fixtures. The original
  flat/grid scene still exists in code (`buildStaticScene` in `main.js`) but
  its UI picker is hidden pending the XR pass (2026-09-15) — see
  `lessons/rendering-internals.md`/`lessons/rendering-apis.md` for the Three.js-specific
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
`lessons/engineering-hygiene.md`'s brightness-lag-reads-as-boring finding) as the
shipped default; a demo-only attack/decay variant was built and deliberately
kept out of the tested port. Full detail in `archive/AudioAnalysis.md` and
`archive/BrowserAnalysis.md`, including a tracked-but-not-started follow-up to
backport the same A/C tuning finding to native Windows/Linux (already
possible with zero code changes, since `Config` already persists every
relevant field).

**Considered and cut: a rougher, real-bulb-driving output using Hue's CLIP
v2 REST API directly from the browser**, bypassing the Entertainment
API's UDP/DTLS stream. Cut because the premise doesn't survive contact
with how browsers actually work, not for lack of interest: the whole
appeal was reaching real bulbs *without* needing the native app running at
all, but the Hue bridge doesn't grant CORS access to arbitrary public
origins (confirmed, not assumed — see `archive/BrowserAnalysis.md`), so a page
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

**Milestone 2 (as originally planned — never built, see corrected Status
above): the native-facing WebUI.** This was this phase's *original*
scope, sequenced deliberately after the demo rather than built first — a
real native setup/pairing/zone-mapping UI was the current weak link in
the funnel (someone sold by the demo landed on env-var Hue configuration,
no GUI), and building the demo first would validate the funnel's front
door before investing in the back half. Kept below as historical record
of the plan; it is not what actually got built, see the real docs linked
in the Status line above.

**Corrected premise (2026-09-15):** verified there is no existing HTTP server
or setup WebUI anywhere in Aurora's core or app repos today — no
`Network::Http::Server`/`HttpLibServerImpl`-shaped code exists, and
`docs/archive/HttpServerAnalysis.md` was never actually written. This section
used to read as "extend the existing httplib-based server (already present
for the setup WebUI)" — that described **huenicorn's** own server
(`SetupBackend`/`WebUIBackend`, `webroot/`), which Aurora's module-split
rewrite never carried forward. This milestone is new
infrastructure, not an extension of anything Aurora already runs — huenicorn's
implementation is still the right template to follow closely (same
cpp-httplib version even, `v0.46.0`), just not something already wired into
this codebase.

- **Analysis pass done (2026-09-15): `docs/archive/HttpServerAnalysis.md`.**
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
  [[webui-design-1st-pass]].** Covers the full screen breakdown (Output
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
    [[webui-design-1st-pass]]'s Build order section: the Dashboard's live
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
    (`app/windows/src/main.cpp:141-144`'s `useAudioMode` derivation);
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
    phase 4 (in [[implementation-plan]]) for why it'd be needed at all.
- New `Output::ThreeJS` module implements `IOutput`; `send()` forwards the
  `Frame` to connected SSE clients. **Already true, not still needed:**
  `Orchestrator`/`AudioOrchestrator` already take a `vector<IOutput*>` and
  broadcast to all of them (phase 2.5's audio work exercised this directly,
  see [[implementation-plan-early-phases]]), not huenicorn's single
  `m_streamer` — Hue and the browser preview running simultaneously needs
  no further `Runtime` change.
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
