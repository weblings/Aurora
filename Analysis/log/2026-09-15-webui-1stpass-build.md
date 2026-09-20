# WebUI 1stPass build order log (2026-09-15)

Moved out of WebUI_Design_1stPass.md — the design doc keeps screens, decisions, and inventory; this file keeps the per-step build record. Beads: phase-3 closed milestones.

---

## Build order

Sequenced by actual dependency, not by the screen numbering used above — a
screen can't be usefully built before the backend surface and shell pieces it
depends on exist. Preview streaming, which `ImplementationPlan.md` lists first
among Milestone 2's "three native surfaces," is intentionally pushed to the
end here, since nothing in v1 consumes it (see Decisions log above).

### Table of Contents

Backend Foundation

1. Research pass
2. HTTP server skeleton
3. /api/capabilities endpoint
4. Hue credential persistence
5. Pairing endpoints

Frontend Foundation

6. Design tokens + repo split
7. App shell
8. Dropdown component
9. Bare Dashboard shell

Screens

10. Output Connect (screen)
11. Backend for screens 2-4
12. Mode + Device Select (screen)
13. Tuning/Settings (screen)
14. Backend: ZoneMap endpoints
15. Zone Mapping (screen)
16. Backend: Stop endpoint
17. Dashboard, filled in

Wiring and Polish

18. First-run vs. returning-user routing
19. Cross-width QA pass

### Backend Foundation
1. Research pass — Studied huenicorn's real server/pairing code and confirmed its HTTP server design was worth reusing, but noted Aurora's full-pipeline-rebuild approach would need one consistent lock, not huenicorn's narrower one.

   Confirmed huenicorn's server is a genuinely generic, transport-agnostic abstraction
   worth adopting near-verbatim, that it needs its own dedicated thread
   separate from the tick loop (huenicorn's own `Runtime::_initWebUI`
   pattern), and that Aurora's planned full-pipeline-reconstruction design
   (unlike huenicorn's in-place mutation) needs one consistent lock around a
   swappable pipeline unit, not huenicorn's narrower single-mutex approach.

2. HTTP server skeleton — Ported huenicorn's server into a new shared core/Network module so both Windows and Linux apps share one implementation instead of duplicating it.

   `core/Network` (`Aurora::Network::Http::Server`), a near-verbatim port of huenicorn's
   `HttpServer`/`Impl`/`HttpDataStructs` shape plus `serveStaticFiles()` atop
   cpp-httplib's own mount-point support, in the new shared `core/` module
   `HttpServerAnalysis.md` called for (not duplicated per app repo). Compiles
   and links cleanly as a library (`AuroraNetwork.lib`, confirmed via a real
   build). Its Catch2 tests (`core/tests/NetworkTests.cpp` — a route
   round-trip, a path-param/body round-trip, and static-file serving, each
   over a real bound socket) compiled cleanly but couldn't initially be *run*
   natively on Windows: linking any test binary in this environment hits a
   pre-existing, environment-wide issue unrelated to this module (a stale
   vcpkg-cached `Catch2d.lib` ABI-incompatible with this machine's Windows
   SDK/MSVC toolset — confirmed by the same failure on an untouched
   pre-existing test target; see `engineering-hygiene.md`'s entry). Fixing
   that natively needs a real from-source rebuild of the vcpkg manifest
   (binary-cache bypass), still not attempted as out of scope. **Actually
   executed for real during step 5** instead, via WSL2/GCC (no Catch2 ABI
   issue there) once `AuroraNetwork` had a real second consumer
   (`Aurora-Output-Hue`'s new `PairingRoutes.cpp`) to build against: all 3
   cases passed, 12 assertions.
3. /api/capabilities endpoint — Added the first real REST endpoint plus the server's actual start/stop lifecycle, catching a real bug in passing (an early-exit path would have crashed the process via an un-joined thread).
  
   Added to both `Aurora-App-Windows` and `Aurora-App-Linux`'s `main.cpp` (route logic
   duplicated per app, matching the existing `Registry`/`registerInputs`/
   `registerOutputs` convention — `Registry` itself is a byte-identical
   duplicated header across both app repos already, confirmed by `diff`, so
   this isn't a new inconsistency). Also wired the server's actual lifecycle
   in for the first time: bind on load, `listen()` on its own thread
   (`HttpServerAnalysis.md`'s documented model), stopped after outputs shut
   down. Building this surfaced a real bug before it shipped: the first pass
   used a bare `std::thread`, stopped only at the tail of `main()` — the
   pre-existing "no outputs available" early return skips that tail
   entirely, and `std::thread::~thread()` calls `std::terminate()` on a
   still-joinable thread, so that path would have aborted the whole process.
   Fixed with a small RAII wrapper whose destructor stops and joins
   unconditionally. Verified for real on both platforms: built via MSVC and
   via WSL2/GCC, ran each binary, confirmed the endpoint's real JSON
   response, and confirmed clean shutdown on both the early-return path
   (Windows) and a real `SIGTERM` (Linux).

4. Hue credential persistence — Built a CredentialsStore so a paired bridge's address/username/key survive a restart, with the persisted value always beating the dev-only env-var fallback.

   The "new `Config` fields or a sibling file" question this line left open resolved
   itself once `Config.hpp`'s own header comment was actually read: "output-
   specific state (bridge credentials, zone maps) lives in each plugin's own
   scope, never here" — a deliberate, pre-existing architectural rule, not
   an oversight to route around. That rules out new `Config` fields outright.
   Built `Aurora::Output::Hue::CredentialsStore` in `Aurora-Output-Hue`
   itself instead, mirroring `ZoneMapStore`'s own exact shape (a small
   `explicit Store(configRoot)` class, `<configRoot>/hue-credentials.json`)
   rather than a generic core-owned file, since credentials are exactly the
   kind of "each plugin's own scope" state that comment describes. Persists
   `bridgeAddress`/`username`/`clientkey`/`entertainmentConfigurationId` as
   one JSON object; `HueConnection::isConfigured()` gates whether the `hue`
   output gets registered at all, same as before. `registerOutputs()` in
   both apps now checks the store first and only falls back to the env vars
   when it's empty — a persisted connection always wins if both are set, so
   env vars are a true dev-only fallback, not a second equally-valid source.
   Verified with real unit tests (round-trip, missing-file default, corrupt-
   file default, `isConfigured()`'s exact gating) run via WSL2, and with a
   real precedence test on both platforms (a persisted file plus
   deliberately-different env vars set simultaneously, confirming the output
   still registers via the persisted path).

5. Pairing endpoints — Built the real discover/validate/register/pick-entertainment-config flow as stateless per-request routes, giving Output Connect an actual backend to talk to.

   `Aurora::Output::Hue::registerPairingRoutes` in `Aurora-Output-Hue` (`PairingRoutes.hpp`/`.cpp`),
   called from both apps' `main.cpp` right next to `registerCapabilitiesRoute`,
   guarded by the same `AURORA_OUTPUT_HUE_IO_AVAILABLE` macro as `HueOutput`
   itself. Routes: `GET /api/hue/discover` (proxies meethue.com, same as
   `ApiTools::autodetectedBridge()`), `GET /api/hue/connection` (persisted
   status, credentials withheld), `PUT /api/hue/validate` (bridge reachability
   via `/api/0/config`), `PUT /api/hue/register` (parses the bridge's
   one-element array response into `succeeded`/`username`/`clientkey` or
   `link_button_not_pressed`/`bridge_error`), `PUT
   /api/hue/entertainment-configurations` (list), `POST /api/hue/connection`
   (the one persisting call, via `CredentialsStore`). One real design fork
   from huenicorn: **stateless**, not session-based — huenicorn's
   `CoreService` holds pairing-in-progress state (bridge address, username,
   clientkey) across separate WebUI calls; here each request carries
   whatever it needs in its own body, so there's no in-memory "pairing
   session" object to design, invalidate, or leak. Composed entirely from
   existing `ApiTools`/`HttpClient`/`BridgeAddress`/`CredentialsStore` --
   no new bridge-facing I/O was needed, only the route layer and JSON
   marshalling. This is also the first thing in this plugin to depend on
   `core`'s `AuroraNetwork` module (linked in the existing IO-gated CMake
   block). Verified for real on both platforms: built via MSVC and WSL2/GCC,
   ran each binary with dummy env-var credentials to reach the tick loop,
   and curled every route -- confirmed `validate`/`register` degrade to
   `{"succeeded":false,"error":"unreachable"}` against an unroutable address,
   `entertainment-configurations` degrades to an empty list on the same,
   `POST /api/hue/connection` rejects an incomplete body and persists a
   complete one (confirmed by reading the resulting `hue-credentials.json`
   back off disk and by `GET /api/hue/connection` reflecting it), and a
   malformed JSON body returns a clean 400 rather than crashing the handler.
   Building this also closed out step 2's one open item: with `AuroraNetwork`
   now proven by a real consumer, `core/tests/NetworkTests.cpp` was finally
   *run* (not just compiled) via WSL2/GCC, sidestepping the native-Windows
   Catch2/ABI issue entirely -- all 3 cases passed (12 assertions).

### Frontend Foundation (shell, no real screens yet)

6. Design tokens + repo split — Settled on a grayscale-only palette (no brand accent) and spun the WebUI into its own sibling repo since it needs different tooling than the C++ apps.

   Re-reading `desktop.html`/`RockyRoadImport` directly (not the earlier summary) first corrected the
   finding itself — see the Cross-cutting findings entry above: `#8b8b8b` is
   already the real, consistently-reused interactive/active-state color
   (sliders, checked toggles, secondary buttons); `#2a6eff` is a genuine but
   narrow one-off (one conditional button, one screen). Decision, discussed
   with the user rather than assumed: Aurora's tokens go **grayscale-only**,
   no brand accent — `#8b8b8b` already fills that role, and Aurora is a
   lighting-control product where introducing a second, arbitrary UI color
   alongside the actual RGB lighting output being controlled seemed more
   likely to compete visually than clarify anything.
   <br><br>
   Also settled, since defining tokens meant deciding where they'd actually
   live: **`Aurora-WebUI` is a new sibling repo**, not a directory inside
   `core` or a per-app `webroot/`. Reasoning (discussed with the user): unlike
   Input/Output's repo splits, which exist for a *technical* reason
   (independently skippable dependencies, per-platform/vendor SDKs), the
   WebUI is byte-identical for both apps and needs no C++ dependencies at
   all — its own split is justified by toolchain hygiene instead (it will
   eventually need real frontend tooling for phase 4's WebXR/uikit pass, per
   `ImplementationPlan.md`, which has no business living inside a CMake/vcpkg
   repo). Wired as a **required** dependency in both apps (unconditional
   `FetchContent_Declare`/`MakeAvailable`, no `ENABLE_`-style toggle like
   Hue's IO gate) — reflecting that this is the product's one control
   surface, not a swappable plugin. Confirmed via CMake's own docs that
   `FetchContent_MakeAvailable` on a source tree with no `CMakeLists.txt`
   just populates it and skips `add_subdirectory()` without erroring — no
   need for the deprecated standalone `FetchContent_Populate`. The fetched
   `SOURCE_DIR` is baked into each app as a compile definition
   (`AURORA_WEBUI_SOURCE_DIR`) and handed straight to `HttpServer::
   serveStaticFiles()`; explicitly a dev-stage placeholder, same as
   `HttpServer.hpp`'s own comment already flagged (a real install/embed story
   like huenicorn's release-build webroot embedding is out of scope for now).
   <br><br>
   One real finding from wiring static files and API routes together for the
   first time: read cpp-httplib's actual `Server::routing()` source rather
   than assuming, since `serveStaticFiles()` and the pairing/capabilities
   routes had never been exercised together before this step. Confirmed the
   static mount point is checked *before* dispatching to a registered GET/
   HEAD handler — safe only because Aurora-WebUI's own files never collide
   with an `/api/...` path. Documented as a hard rule in `Aurora-WebUI`'s
   README (never add a file under `api/` there) rather than leaving it as an
   implicit assumption.
   <br><br>
   Verified for real on both platforms: created `Aurora-WebUI` (git-inited,
   GPL-3.0 matching `Aurora-Output-Hue`'s own lineage reasoning, `styles/
   tokens.css` with the settled values), wired the `FetchContent`+
   `serveStaticFiles()` plumbing into both apps' `CMakeLists.txt`/`main.cpp`,
   built via MSVC and WSL2/GCC, and curled both binaries — confirmed
   `tokens.css` serves its real content, `/api/capabilities` and
   `/api/hue/connection` still answer correctly alongside it, and a
   nonexistent static path correctly 404s rather than falling through to a
   route.

7. App shell — Built the shared page skeleton, top bar, and settings modal every screen plugs into, so no screen has to reinvent its own chrome.

   in the new `Aurora-WebUI` repo: `index.html` (page skeleton: `#screen-container` mount point + the
   settings overlay/scrim/panel markup), `shell.css` (page reset, the
   scrollbar-gutter fix, centered max-width column, top bar, and the settings
   modal — all referencing `tokens.css`'s variables, zero literal hex),
   `shell.js` (an `App` class: `navigate()` unmounts the current screen then
   mounts the next into `#screen-container`, `openSettings()`/
   `closeSettings()` toggle the overlay — trimmed way down from RockyRoad's
   own `App.ts`, which carries a renderer, song pause/resume, a countdown
   overlay, and per-instrument settings sections that don't apply here), and
   `topBar.js` (a `renderTopBar()` helper — the one reusable piece that
   enforces "one top bar formula, everywhere" structurally instead of by
   convention, the same problem `tokens.css` solves for colors). The title is
   absolutely centered within the bar rather than flex-centered between the
   side slots, since those slots are rarely equal width (no Back vs.
   Back+gear vs. pill+gear) and flex centering would visibly drift the title
   depending on which is present. Settings-modal *content* is deliberately
   empty for now (`#settings-body`) — actions like "Re-pair bridge" land
   there once the screen that needs them exists, matching the Dashboard's own
   "bare shell, built early" precedent (step 9).
   <br><br>
   Verified two ways, since no browser-automation tool exists in this
   environment: real DOM behavior was exercised with `jsdom` (installed only
   in the session scratchpad, not this repo — a test-only dependency, same
   relationship Catch2 has to the C++ repos' own shipped binaries) — settings
   modal open/close via direct calls, scrim click, close-button click,
   `navigate()`'s mount-then-unmount-previous ordering, the top bar's back
   button present/absent, gear click firing `onSettings`, status pill
   present/absent, and title text escaping (a screen title is rendered via
   `textContent`, not interpolated as markup) all confirmed against a real
   `Document`, not by reasoning about the code. Separately, confirmed via the
   actual running `aurora-app-windows.exe` that every file serves with the
   right content type (`text/html`, `text/javascript`, `text/css`) and `GET /`
   resolves to `index.html`. Genuine visual/interaction verification in an
   actual browser is still outstanding — flagged rather than skipped over.

8. Dropdown component — Ported RockyRoad's dropdown with real ARIA/keyboard support, deliberately diverging from the reference spec so browsing with arrow keys doesn't fire side-effecting actions before the user commits.
   `Dropdown.js`, `styles/dropdown.css`. Before implementing, verified the exact required pattern rather than guess —
   fetched the real WAI-ARIA APG "Collapsible Dropdown Listbox" example,
   since the component inventory had already named the target shape
   (`role=listbox/option`) but not its precise contract. Implements it with
   one deliberate, documented divergence: the reference pattern commits a
   value on every arrow-key press ("select follows focus"); here arrow keys
   only move `aria-activedescendant` and a `.active` visual cursor, and only
   Enter/Space/click/Tab-out actually calls `onSelect` — committing on every
   keystroke was fine for the reference's plain value, but Aurora's
   `onSelect` callbacks can trigger real side effects (switching a capture
   device, a REST call), which shouldn't fire while a user is still browsing
   options. Typeahead (jump to an option by typing its first letter) is the
   other piece of the reference pattern left out — a deliberate cut, not an
   oversight. Also closed one gap noticed while porting: RockyRoad's own
   `.dropdown-fill` CSS modifier (trigger fills its container's width,
   chevron pushed to the far edge) is needed for the full-width dropdowns
   already drawn in this doc's own constrained-layout ASCII, so it's exposed
   as a `fill` constructor option rather than left copied-but-unreachable.
   Two token additions along the way: `--aurora-surface-hover`/
   `--aurora-surface-selected` (RockyRoad's real `#2a2a2a`/`#242424` menu
   states, matching no existing token).
   <br><br>
   Verified with the same real-DOM approach as step 7 (`jsdom`, scratchpad-
   only): static ARIA wiring (`aria-haspopup`, `role=listbox/option`,
   `aria-label` fallback and `aria-labelledby` wiring when an external label
   is given), opening via click or ArrowDown moves DOM focus to the listbox
   and seeds the active cursor on the current selection, arrow/Home/End
   navigation moves `aria-activedescendant` *without* calling `onSelect` or
   touching the underlying `aria-selected` state, ArrowDown clamps at the
   last option rather than wrapping, Enter/click/Tab all commit and close
   (Tab without forcing focus back, so the browser's own Tab continues
   naturally), Escape closes without committing and returns focus to the
   trigger, an outside click closes without committing, and opening one
   dropdown closes any other already-open one. Confirmed served correctly
   (`text/javascript`/`text/css`) via the real running Windows binary.
   Genuine screen-reader/browser verification is still outstanding, same
   caveat as step 7.

9. Bare Dashboard shell — Built the hub screen with real status on each row but placeholder screens behind them, giving the app something real to navigate to before the actual screens existed.

   `screens/DashboardScreen.js` (nav rows only — Bridge/Zones/Tuning, no mode
   toggle or Stop yet, those need steps 11/16's backend endpoints first) and
   `screens/PlaceholderScreen.js` (a shared "this screen isn't built yet"
   stand-in with a working Back button, used by all three nav rows for now —
   gives the shell real navigate()/back targets today instead of a silent
   no-op or dev-only shortcut, deleted one usage at a time as each real
   screen lands). Screens take `app` via their own constructor rather than
   importing a shared singleton, matching RockyRoad's own `IScreen` shape —
   avoids a circular import between `app.js` and every screen module.
   <br><br>
   "Wired to the capability-probe/persisted-state routing logic" turned out
   to mean something narrower than full first-run-vs-returning-user routing
   (that's step 18, once screens 1-4 exist to route to): the Bridge row's
   status is real data from `/api/capabilities` + `/api/hue/connection`, the
   only two persisted-state endpoints that exist yet. Distinguishes three
   real cases with different messages, not one generic fallback: the Hue
   output isn't compiled into this build at all, it's compiled in but not yet
   paired, and the capabilities probe itself failed (e.g. server
   unreachable) — the last two look similar to a user but come from different
   layers, so conflating them into one message would have been a real (if
   minor) drop in fidelity. The Zones row has no backing endpoint yet
   (ZoneMap REST is step 14) and stays an honest placeholder rather than
   fabricated data.
   <br><br>
   One correction made in passing: `shell.css`'s `.status-pill` (built in
   step 7, before any screen used it) had guessed at a generic pill shape.
   Now that the Dashboard actually needed it, re-checked the plan's own cited
   precedent (RockyRoad's real `.lib-badge`) and found it didn't match at
   all — corrected to the real values (`#8b8b8b` background, 10px/500-weight
   text, 3px radius) rather than leaving the guess in place now that it had a
   real consumer.
   <br><br>
   Verified with the same `jsdom` approach as steps 7-8, plus one step
   further: a *live* end-to-end pass (no mocked `fetch`) against the actual
   running `aurora-app-windows.exe`, confirming the real HTTP round trip and
   real DOM update together, not just each half separately. Mocked-fetch
   tests covered all three Bridge-status cases above, that clicking a nav row
   navigates to the right placeholder with the right title, and that its
   Back button returns to a freshly-rendered Dashboard. Confirmed all new
   files serve with the correct content type via the real binary.

### Screens, in dependency order

10. Output Connect (screen) — Built the actual bridge-pairing UI (address entry, push-link wait, config picker) as the first full slice through the whole stack, backend to browser.

    `screens/ OutputConnectScreen.js`, plus two new shared stylesheets other screens
    will also draw on — `styles/forms.css` (buttons, text inputs, labeled
    fields, inline status text — generalized from `.tuner-btn`/
    `.tuner-btn-exit`'s real light/dark button roles) and `styles/
    output-connect.css` (this screen's own address-row/actions layout).
    Wired into `DashboardScreen`'s Bridge row in place of `PlaceholderScreen`
    — disabled outright when this build has no Hue output, real screen
    otherwise. A four-phase state machine (`entry` → `pairing` →
    `configSelect` → `done`), each phase its own render function:
    - `entry`: address field (pre-filled from any already-persisted
      connection, for re-pairing) + Autodetect (`GET /api/hue/discover`) +
      Continue (`PUT /api/hue/validate` first, a clear fast failure for a bad
      address before ever showing "press the button").
    - `pairing`: calls `PUT /api/hue/register`; `link_button_not_pressed`
      re-shows the same wait text with no client-side poll loop, matching
      huenicorn's own real click-to-retry UX (step 5's research) exactly —
      the user physically presses the button, then clicks Continue again.
      Includes a small "Change address" escape hatch back to `entry`, not in
      the original ASCII sketch but a cheap, clearly-justified addition (a
      typo'd address shouldn't require walking away and back).
    - `configSelect`: `PUT /api/hue/entertainment-configurations`. Skips the
      Dropdown entirely when exactly one configuration exists (nothing to
      choose), but never auto-selects among more than one — `output.md`'s own
      filed lesson that a bridge having several is normal, not an edge case.
      Zero configurations shows a real message citing the actual constraint
      (create one in the official Hue app first) plus a "Check again" retry.
    - `done`: persists via `POST /api/hue/connection` (the one write in this
      whole flow, matching step 5's stateless design), then a `Continue`
      button calling `onComplete` — a caller-supplied callback rather than a
      hardcoded destination, so a later first-run bootstrap can chain into
      Mode+Device Select once it exists without this file changing.
    <br><br>
    One correction made in passing: `shell.css`'s `.status-pill` (step 7,
    fixed for real in step 9) was fine, but this step's own new status-text
    styling raised the "should errors/success be colored" question the
    grayscale-only decision hadn't explicitly addressed — resolved by keeping
    status text grayscale too, reasoning that the ✓/⚠ glyph plus explicit
    wording already carries the meaning, and introducing red/green here would
    reopen the accent-color decision without checking back in.
    <br><br>
    Verified with the same `jsdom` approach as steps 7-9 — the full happy
    path (validate → link-button retry → register success → 2-option
    Dropdown → finish → done → `onComplete`), the 1-config and 0-config
    branches, an unreachable address stopping before any registration
    attempt, "Change address" preserving the typed value, and pre-fill from
    an existing connection — plus a *live*, unmocked pass against the real
    running binary. That live pass incidentally confirmed the real
    `internalipaddress` field name against the actual discovery API by
    finding a real bridge on the network (discovery/validate only — no real
    registration was attempted against real hardware, deliberately, since
    that needs a physical button press and would create a real persisted
    credential). Confirmed all new files serve with the correct content type.

11. Backend for screens 2-4 — Added the remaining config/monitor endpoints that Mode+Device Select and Tuning would need to read and write real state.

    except audio-sink listing (see below).** Generic settings REST endpoints
    over `Config`'s user-facing fields are ~~done~~ — `Aurora::Runtime::
    registerSettingsRoutes` in `core/Runtime` (`SettingsRoutes.hpp`/`.cpp`),
    the first thing in `Runtime` itself (not an app or a plugin) to register
    HTTP routes, linking `AuroraNetwork` the same way `Aurora-Output-Hue` did
    in step 5. `GET /api/config` returns all ~19 user-facing fields (not
    `restServerPort`/`boundBackendIP`, read once before the server can even
    answer a request); `PUT /api/config` is deliberately PATCH-style despite
    the verb — merges only the fields present in the body, since asking a
    caller to resend all 19 to change one slider would be painful. Each field
    funnels through `Config`'s own setter, so existing clamping (e.g.
    `transitionSmoothing` to `[0, 0.97]`) applies with zero duplicated
    validation; an unrecognized `interpolation` string is silently ignored
    rather than erroring, matching the rest of this field-by-field merge's
    forgiving-per-field posture. Verified on both platforms: real GET/PUT
    round trips confirming the partial merge leaves untouched fields alone,
    real clamping, an invalid enum value being ignored rather than crashing,
    a malformed body returning a clean 400, and the merged result actually
    persisted to `config.json` on disk (read back to confirm).
    <br><br>
    Reload entrypoint and monitor listing. Both apps
    now have a `Pipeline`/`PipelineHost` pair (in each app's own `main.cpp`,
    not core::Runtime — building one needs `Registry` and this app's own
    input-name/ifdef dispatch, both app-layer concepts, same reasoning that
    already keeps `registerInputs`/`registerOutputs` per-app). `Pipeline`
    is the swappable unit huenicorn's own design fork calls for
    (`HttpServerAnalysis.md`: reconstruction, not mutation) — it owns
    input/outputs/orchestrator and is thrown away and rebuilt whole, never
    mutated in place. `PipelineHost` wraps it in one mutex (the "one
    consistent lock around a swappable pipeline unit" that doc recommended,
    not huenicorn's narrower single-mutex approach): `tick()` (main thread)
    and `reload()` (the HTTP thread) take the same lock, and `reload()`
    builds the replacement *before* acquiring it, so a slow or failing build
    never blocks a tick already in progress, and the old pipeline's
    `shutdown()` runs only after the swap, once no `tick()` call can reach it
    anymore.
    <br><br>
    `SettingsRoutes` gained an `onConfigChanged` callback (empty by default)
    — "every settings PUT funnels into reload" turned out to mean threading
    a callback through core::Runtime rather than reload logic living there
    directly, since `Config`/`ConfigStore` are core concepts but `Registry`/
    `Pipeline` aren't. Each app wires it to call `PipelineHost::reload()`
    with a freshly-reloaded `Config` (not the request's own now-stale copy).
    A failed reload is reported as a distinct `reloadError` field, not
    `"succeeded": false` — the save itself still succeeded, only the live
    pipeline couldn't pick it up, and conflating the two would hide that the
    persisted value is actually correct. A standalone `POST /api/reload`
    also exists for triggering one with no field actually changed (e.g.
    "re-scan" after plugging in a monitor). `GET /api/monitors` reads
    `Pipeline::listMonitors()` (empty array in audio mode, not an error).
    <br><br>
    **One real tradeoff surfaced by testing, not just reasoned about:**
    moving pipeline construction before `httpServer.bind()` (required, since
    the settings/monitors/reload routes all capture `pipelineHost` by
    reference and `HttpServer` requires every route registered before
    `bind()`) measurably delays when the WebUI becomes reachable at startup
    — confirmed by polling `/api/capabilities` every 500ms, ~1.5–2s on this
    machine with real DXGI monitor enumeration in the mix, versus
    near-instant before this step (the server used to bind before the
    pipeline was built at all). Accepted as a real, documented tradeoff
    rather than solved with a nullable-initial-pipeline design (routes and
    the tick loop tolerating "not ready yet") — that would have closed the
    gap but added real edge-case surface for a few seconds of startup
    latency on an already-slow-starting piece (real capture hardware
    enumeration), not judged worth it here.
    <br><br>
    Verified on both platforms with the same real-server approach used
    throughout this build order, this time specifically probing for the
    core safety guarantee rather than just the happy path: a settings PUT
    writing a deliberately-invalid `activeInputName` persists correctly
    (confirmed in the response body), reports a distinct `reloadError`
    ("Unknown input '...'"), and — checked directly, not assumed — the
    process stays alive and still serving (`/api/capabilities` still
    returns 200) with the *old* pipeline still running untouched. A
    follow-up PUT fixing the value back to a real input then reloads
    cleanly with no error. Also confirmed the manual `POST /api/reload`
    path, and on Windows, `GET /api/monitors` returning this machine's real
    connected displays (verified real data, not placeholder — two actual
    monitors with their real resolutions/refresh rates/primary flag).
    <br><br>
    Audio-sink listing (the other half of "monitor/sink listing endpoints")
    is a further, separate gap, not silently dropped: `Aurora-Input-Linux`
    has no sink-enumeration capability at all today (checked directly, no
    matches for any enumerate/list-sinks pattern), unlike video's
    `IVideoInput::monitors()` which already existed and just needed a live
    instance to call it on. Building it means new PipeWire registry-query
    code in a different repo, not just wiring an existing capability through
    HTTP — left for a dedicated pass, not attempted here.

12. Mode + Device Select (screen) — Built the video/audio toggle and device picker, exporting small helpers the Dashboard's own quick-toggle would later reuse.

    `screens/ModeDeviceScreen.js` + `styles/mode-device.css`, plus a new shared
    `.segmented`/`.segmented-btn` component in `forms.css` (ported from
    `RockyRoadImport/SongConverter`'s real `.tabs`/`.tab-btn`, verified
    directly — final component inventory's "Screens 2, 5" entry, reused
    unchanged when step 17 builds the Dashboard's own mode toggle). Wired
    into a new "Capture source" row on `DashboardScreen`, inserted between
    Bridge and Zones — the build-order text for step 12 said only "needs
    step 11," but the navigation-model flow diagram earlier in this doc
    (returning users reach "each of 1/2/3/4" from the Dashboard) already
    required Dashboard to link here; the current Dashboard mockup's own
    nav-row list just hadn't been updated to show it. Resolved by adding the
    row now rather than leaving screen 2 unreachable outside first-run until
    step 17.
    <br><br>
    The audio/video toggle (`.segmented`) only renders when
    `/api/capabilities`'s `audioInputs` is non-empty, matching the spec's
    "only when both are compiled in." Below it, one of two device pickers:
    - **Video:** a `Dropdown` of `GET /api/monitors` entries plus a synthetic
      "Auto (primary)" option for an empty `activeMonitorName`. Real gap
      found and handled, not assumed: `/api/monitors` reflects only whatever
      the *live* pipeline actually constructed
      (`PipelineHost::listMonitors()` returns an empty vector whenever
      `m_videoInput` is null, i.e. whenever the daemon is currently running
      in audio mode) — confirmed live on real hardware, not just read in
      code (see verification below). Switching the tab to Video while the
      daemon is currently live in audio mode therefore can't show real
      monitor choices yet; rather than a fake list, the screen shows a
      single "Auto (primary display)" notice and asks the user to Save then
      reopen, and Done omits `activeMonitorName` from its PUT entirely in
      that case (PATCH semantics leave the persisted value untouched, per
      `SettingsRoutes`'s own design) instead of writing something fabricated.
    - **Audio:** cut further than the original spec's own ASCII layout
      implied. `Aurora-Input-Linux` has no sink-enumeration capability at
      all (step 11's flagged gap) and Windows audio has no device concept
      to enumerate in the first place, so no dropdown exists here at all.
      Windows builds (audio input name `windows-audio`) get a plain
      "Uses your system's default audio device" line; Linux builds (`
      linux-audio`) get a free-text field for the already-fully-wired
      `Config::audioTargetSinkName`, labeled "optional" and explained as a
      manual-entry workaround for the missing listing endpoint — a real,
      honest device override rather than a fake picker, using a field
      `SettingsRoutes`/`Config` already round-trip completely. Which variant
      to show is decided from `audioInputs.includes('linux-audio')` —
      reusing the existing platform-specific registry naming convention
      instead of adding a new `/api/capabilities` field just for this.
    - `activeInputName`/`activeAudioInputName` (registry plugin names like
      `windows`/`linux`/`x11`/`pipewire`/`windows-audio`) are never shown as
      raw choices — `pickVideoInputName`/`pickAudioInputName` resolve them:
      keep an existing valid non-`dummy` choice if there is one (so a manual
      `x11`/`pipewire` override made outside the UI survives an unrelated
      monitor change), otherwise prefer the platform's own `linux`/`windows`
      auto-select meta-name, otherwise fall back to the first real
      (non-`dummy`) registered name. `dummy` is filtered out everywhere —
      never a value this screen writes.
    <br><br>
    Tested with jsdom against the real on-disk files (same substitute-for-a-
    headless-browser method used throughout this build order): the two
    name-picking heuristics as pure-function unit tests; the Dashboard's new
    row rendering, its label reflecting live/audio state, its status-
    unavailable fallback when either probe fails independently, and its
    click wiring into this screen; this screen's own video-with-real-
    monitors render, the Windows audio-mode render (no sink field), the
    Linux audio-mode render (sink field pre-filled from persisted config),
    the empty-monitors-degrades-to-Auto-only path, a `reloadError` response
    surfacing inline without faking the success phase, and the toggle
    itself being absent entirely when `audioInputs` is empty. Also verified
    live against the real Windows binary on real hardware, not just jsdom:
    the two new static files (`ModeDeviceScreen.js`, `mode-device.css`)
    serve with real 200s; `GET /api/capabilities`/`api/config` match this
    screen's assumed field names and shapes exactly; `GET /api/monitors`
    returns this machine's three real displays; a `PUT /api/config` mode
    switch to audio succeeds cleanly with the process staying alive; and —
    the one behavior that mattered most to confirm for real rather than by
    reading `PipelineHost::listMonitors()`'s source — `GET /api/monitors`
    genuinely comes back `{"monitors":[]}` while live in audio mode, then
    genuinely repopulates with the same three real displays after switching
    back to video, exactly matching what the empty-list UI path assumes.

13. Tuning/Settings (screen) — Built the save-in-place knobs screen for both video and audio modes, sharing one slider/section design across both.

    `screens/TuningScreen.js` + `styles/tuning.css`, plus two new shared `forms.css` components used
    for the first time here — `.section-heading` (ported from
    `RockyRoadImport/SongConverter`'s real `<h2>` + `.tab-panel::before`, its
    1px divider mapped onto Aurora's own `--aurora-divider` token rather
    than the source's literal 3px, since that heavier weight was a tab
    strip's own divider role there, not a plain section break) and
    `.toggle-row`/`.toggle-switch`/`.toggle-knob` (ported from RockyRoad's
    real `.pre-toggle-switch`/`.pre-toggle-knob`, verified against
    `v2/desktop.html` — a hidden checkbox driving a sibling knob via
    `:checked`, not a custom-drawn control; its checked-state color is
    already `--aurora-accent`, the same `#8b8b8b` the source uses). Wired
    into `DashboardScreen`'s Tuning row in place of `PlaceholderScreen`.
    <br><br>
    Per the spec's own "cut tabs, keep plain headings" decision, video mode
    (4 fields, one implicit group) renders with no heading at all; audio
    mode (11 fields) renders three: **Response speed** (bounce/brightness
    smooth time, drift base rate), **Color character** (vibrancy
    saturation/value, plus the fixed-hue toggle and its conditional 0–360°
    slider), **Sensitivity** (dynamism floor, centroid strength, reference
    RMS, brightness floor, centroid range) — this exact grouping was only
    named in the spec's own "cut from the first pass" paragraph about tabs,
    not laid out anywhere else, so it doubled as the section plan once tabs
    were dropped in favor of headings. Slider ranges for the 10 float
    fields with no server-side clamp (`Config::setAudioBounceSmoothTime`
    etc. just assign, unlike `transitionSmoothing`'s real `[0, 0.97]` clamp)
    came from `AudioEffectSettings`'s own field comments (`AudioProcessing.hpp`),
    not guessed — e.g. `centroidStrength`'s "0 = no effect" implying a
    bounded 0–1 multiplier, `driftBaseRateDegPerSec`'s "full rotation every
    60s by default" implying a 0–60°/s ceiling (10x default speed).
    <br><br>
    **`audioTargetSinkName` is deliberately not surfaced here**, resolving a
    real inconsistency in the original spec text: this section's own job
    description listed it alongside the full `AudioEffectSettings` block,
    but screen 2's job description had already assigned it to Mode+Device
    Select ("a PipeWire sink for audio on Linux"), which built it in step
    12. Keeping it there means one editable surface per field, not two
    screens each holding a separately-stale copy of the same
    `PUT /api/config` field.
    <br><br>
    **Save works differently here than every other screen's "done" phase,
    deliberately.** `OutputConnectScreen`/`ModeDeviceScreen` gate a one-shot
    decision and advance to a `done` phase requiring an explicit Continue
    click. Tuning's own job is iterative adjustment (nudge a slider, listen,
    nudge again), so that gate would fight the screen — Save here writes in
    place, shows an inline ✓/⚠ status line, and stays on the edit screen.
    This isn't just a style choice: `PipelineHost::reload()` (every app's
    `main.cpp`) always calls `Pipeline::build()` fresh — there is no
    settings-only update path, confirmed by reading it, not assumed — so
    *every* Save here tears down and reconstructs the entire live pipeline,
    video/audio input included, not just applies new numbers to an
    already-running one. That real cost is also why sliders don't
    live-apply per drag tick (a reload per animation frame would rebuild
    the whole pipeline dozens of times a second); edits are batched behind
    one explicit Save/PUT instead.
    <br><br>
    One real behavior confirmed live, not just from reading `Orchestrator::
    init()`'s source, that shapes what "0 = auto" actually means for
    `subsampleWidth`/`refreshRate` here: saving `subsampleWidth: 0` persists
    correctly in that PUT's own response (confirmed), but the very reload
    that same PUT triggers rebuilds the pipeline while still in video mode,
    which re-derives `subsampleWidth` from the display immediately and
    persists the concrete result right back — confirmed real on hardware
    (`0` in the PUT response, `48` again moments later on the next `GET
    /api/config`). This is correct, intended behavior, not a bug: "0 = auto"
    means "please re-derive it," and it does, immediately — it just means
    reopening this screen after saving `0` will never show `0` back, only
    whatever got derived. Worth naming because it's a different "0/empty
    means auto" contract than `activeMonitorName`'s (which stays genuinely
    empty in persisted config forever unless explicitly set) — two auto
    patterns in the same app, resolving differently, not one convention.
    `refreshRate` has no such round-trip available at all: `Config::
    setRefreshRate` clamps to `>= 1` unconditionally, so a settings PUT can
    never actually request "auto" for it once a concrete value is set — the
    screen's own refresh-rate field label makes no auto claim, unlike
    subsample width's, for exactly this reason.
    <br><br>
    Tested with jsdom: video-mode field rendering and pre-fill from a real
    config shape (no section heading, all 4 fields), a slider's live
    readout updating without a full re-render (`input` event mutating only
    the readout `<span>`+state, not calling `_render()`), a full Save round
    trip asserting the exact PUT body sent; audio-mode's three headings and
    field grouping, the fixed-hue toggle revealing/hiding its slider and
    defaulting a newly-enabled hue to `0` rather than the still-unset `-1`,
    unchecking it resetting to `-1` on the next save rather than leaving a
    stale angle persisted, and confirming the audio PUT body is exactly the
    11 `AudioEffectSettings` fields with `audioTargetSinkName` never present;
    a `reloadError` surfacing inline with Save left retryable, not stuck
    disabled. Also verified live against the real Windows binary on real
    hardware: the two new static files serve with real 200s; a real video
    tuning save (interpolation, transitionSmoothing, subsampleWidth) and a
    real audio tuning save (bounce smooth time, a 120° fixed hue) both round
    -trip through a live `GET /api/config` with the process staying alive
    throughout; and the `subsampleWidth`-auto-rederivation behavior above,
    which is exactly the kind of real-vs-assumed-behavior gap this build
    order has repeatedly found only by testing against the actual daemon.

14. Backend: ZoneMap endpoints — Added get/update routes for each zone's shape/active/gamma, plus a fast in-place update path so editing a zone doesn't force a full pipeline reload.

    `GET`/ `PUT /api/zones`, one combined PATCH-style endpoint (`set UV rect, set
    gamma, set active` from this step's own original phrasing turned out to
    name three *jobs*, not three separate routes — one body covers all
    three, same convention `SettingsRoutes` already established) rather than
    three. `GET` returns `{"outputName", "zones": [...]}` from whatever's
    currently live-reconciled (empty in audio mode or with no outputs, same
    "nothing to report, isn't an error" precedent `/api/monitors` set in
    step 11); `PUT` requires `zoneId` and applies only the `uvs`/`active`/
    `gamma` fields actually present in the body, 404 on an unknown zoneId
    rather than silently no-opping.
    <br><br>
    **Real capability added to core, not just a route wired to something
    that already existed:** `Orchestrator` only had a const `zoneMap()`
    getter before this step -- no way to edit a zone live. Added
    `Orchestrator::updateZone(outputName, zoneId, uvs, active, gamma)`
    (`std::optional` params, PATCH semantics at the C++ level too),
    persisting immediately via the same `ZoneMapStore` `init()` already
    uses.
    <br><br>
    **Deliberately does *not* go through a pipeline reload, unlike every
    other write built in steps 11-13.** `ZoneMap` isn't part of `Config` --
    it's a separate per-output profile `Orchestrator` already holds
    in-memory and reads every tick. A zone edit mutates that same in-memory
    map directly, under the same `PipelineHost` mutex `tick()` already
    takes (so a tick and an edit can never interleave), then persists to
    disk -- no `Pipeline::build()`, no capture/output teardown. This
    matters for real: the Zone Mapping screen's own job (step 15) is
    dragging a rect live while watching the actual lights react, and step
    13 already established that every `Config`-backed reload rebuilds the
    *entire* pipeline from scratch -- doing that on every drag-frame would
    make a live drag interaction unusable. Because `ZoneMap` was already a
    live in-memory structure `Orchestrator::update()` reads directly (not
    routed through `Config`), giving it its own direct-mutation path
    instead of funneling through the reload machinery was a real design
    choice available here, not something the other screens could have used
    too.
    <br><br>
    **Lives in core, not duplicated per app like `registerMonitorsRoute`/
    `registerReloadRoute` had to be.** Step 11's monitors/reload routes
    were forced into each app's own `main.cpp` because they need
    `PipelineHost`/`Registry`, both app-layer types core doesn't know
    about. `ZoneMap`/`ZoneConfig`/`Contracts::UVs` are already core types
    with no such dependency, so `Aurora::Runtime::registerZoneRoutes` (new,
    `core/Runtime/ZoneRoutes.hpp/.cpp`) could take the same generic-
    callback bridging shape `SettingsRoutes`' `onConfigChanged` already
    uses -- `std::function<ZoneListResult()>` +
    `std::function<bool(zoneId, uvs, active, gamma)>` -- and be registered
    once from core instead of its JSON-marshalling logic being copy-pasted
    into both apps' `main.cpp` a second time. Each app's `main.cpp` only
    adds a thin `Pipeline`/`PipelineHost::listZones()`/`updateZone()` pair
    (mirroring `listMonitors()`'s own shape) and one registration call.
    Worth naming as a real improvement over step 11's own precedent, not a
    style preference -- the constraint that forced duplication there
    (app-layer types) genuinely doesn't apply here.
    <br><br>
    **v1 scope limit, documented not silently assumed:** only the first
    output's zone map is reachable (`m_outputPtrs.front()`) -- today's only
    real output is Hue, and the WebUI's own Zone Mapping screen is designed
    around one unified zone grid, not per-output tabs, so this matches the
    UI's actual job rather than under-building it. A second real output
    would need this revisited.
    <br><br>
    Tested with real Catch2 unit tests added to `OrchestratorTests.cpp`
    (`updateZone` edits only the fields given and persists immediately;
    returns `false` for an unknown output or zoneId) -- run for real in
    WSL2 against `core`'s own build tree (28 assertions across 9 test
    cases, all passing), not attempted on Windows: the prebuilt `Catch2d.lib`
    ABI mismatch already on file in `engineering-hygiene.md` blocks linking
    any Windows Debug test binary in this environment, confirmed again here
    as the same pre-existing, unrelated issue (compilation of every new
    file succeeded cleanly on both platforms; only the Windows test
    *link* fails, against Catch2's own object files, not mine). Also
    verified live against the real Windows binary: `GET /api/zones` in
    video mode, a `PUT` with a real body, PATCH semantics (only `active`
    sent, `uvs`/`gamma` left alone), an unknown-zoneId 404, and the
    audio-mode empty-degrade -- all confirmed, except the *successful* edit
    path, which needs at least one real live zone to target and this dev
    environment's Hue output has none (no real bridge reachable, so
    `zoneIds()` returns empty) -- the same real-hardware limitation
    Output Connect's own testing already had in step 10. That path is
    covered by the Catch2 tests and by jsdom mocks once step 15's screen
    exists to exercise it end-to-end.

15. Zone Mapping (screen) — Built the drag-to-resize zone canvas, porting huenicorn's logic but fixing a real gap it never guarded against (a dragged-past-itself rect could crash the image-processing code).

    `screens/ZoneMappingScreen.js` + `styles/zone-mapping.css`. One SVG canvas draws every zone's UV rect at
    once (dimmed, `pointer-events:all` set explicitly since an SVG shape
    with `fill:none` otherwise only hit-tests its stroke, not its body --
    clicking a zone anywhere inside it would have silently missed
    select-on-click without this); a plain HTML overlay (not SVG
    `foreignObject`, simpler and gets real accessible/testable checkboxes
    for free) draws each zone's number + always-visible active checkbox at
    its rect's center, independent of selection. Selecting a zone (click its
    number, or its dimmed rect body) swaps its dimmed rect for a bright one
    plus 4 corner-drag handles and a gamma slider below the canvas — same
    shape as huenicorn's own real `ScreenWidget.js`/`Handle`/`Rectangle`
    classes (read in full before porting, not summarized), ported with its
    plan doc's own two identified gaps closed and one more found while
    reading the source closely:
    - **Pointer Events, not mouse-only** (the planned gap): corner drag uses
      `setPointerCapture` on the handle itself so `pointermove`/`pointerup`
      keep delivering to it even once the pointer leaves it, needing no
      document-level listener add/remove cycle at all — simpler than
      huenicorn's own real approach (`document.addEventListener("mouseup",
      ...)`, installed once, never removed), not just more input types.
    - **A native `<input type="range">` gamma slider** (the planned gap),
      reusing `forms.css`'s `.slider-field-header`/`.slider-value`/
      `.slider-input` from step 13 unchanged, instead of huenicorn's second
      hand-rolled SVG drag control (`GammaHandle`). Range is `[-1, 1]`, not
      `[0, 1]` — confirmed against `Aurora-Output-Hue`'s real
      `gammaExponent(gammaFactor) = 2^(-gammaFactor*2)`, the same convention
      huenicorn's own `Channel::gammaExponent()` uses, not a Hue-specific
      guess.
    - **A real correctness gap, not in the original research:** huenicorn's
      own `Handle.setPosition` clamps a dragged corner only to the screen's
      own bounds, never against the *opposite* corner — dragging a corner
      past its sibling produces an inverted UV rect (`min > max`).
      `Processing::ImageProcessing::getSubImage` has no defense against
      that at all (confirmed by reading it): `cv::Range(a, b)` with `a > b`
      is an invalid OpenCV range, a real crash risk server-side the moment
      a client sends one. This port clamps every drag to a 2% minimum rect
      size measured from the opposite corner instead — a deliberate
      improvement over the reference implementation's own real behavior,
      not a blind port.
    <br><br>
    **No active/inactive two-list panel** (already cut in the original
    plan): every zone's checkbox is always visible and togglable regardless
    of which zone is selected, since Aurora's zone count is fixed by the
    capture scheme rather than an open-ended bridge-light membership
    problem huenicorn's own drag-and-drop list solves.
    <br><br>
    **Every edit PUTs immediately, coalesced per zone, not batched behind
    the header's own "Save" button.** Matches huenicorn's real save-on-
    every-setter feel and step 14's own backend design (`Orchestrator::
    updateZone` persists unconditionally; there's no staged/uncommitted
    concept to actually save). A drag can fire `pointermove` far faster
    than one network round trip, so updates are coalesced per zoneId (at
    most one PUT in flight per zone; a patch that arrives while one is
    already in flight just replaces the pending one rather than queuing a
    backlog of stale intermediate frames) — confirmed with a real test
    firing three drag frames synchronously and checking fewer PUTs went out
    than frames fired, with the last PUT reflecting the final position, not
    an intermediate one. This resolves a real ambiguity the original spec's
    own header line (`Save`) left unstated: "Save" here just means "done
    editing, back to Dashboard," since there's nothing left uncommitted to
    actually save by the time it's clicked.
    <br><br>
    **Deliberate scope cut, documented rather than assumed away:** the
    canvas uses a fixed 16:9 box, not the real active monitor's aspect
    ratio. UV correctness doesn't depend on it (rects are already 0-1
    normalized regardless of the box's own proportions) and fetching the
    real ratio would need extra plumbing (matching `activeMonitorName`
    against a `/api/monitors` entry) this screen doesn't otherwise need.
    Revisit if a very non-16:9 display ever makes the mismatch visually
    confusing enough to matter.
    <br><br>
    Wired into `DashboardScreen`'s Zones row in place of `PlaceholderScreen`
    — its label now reports a real state (`N active` / `None yet` / `Not
    available in Audio mode` / `Status unavailable`) instead of the
    hardcoded "Not available yet" placeholder text step 9 left there.
    `PlaceholderScreen.js` itself is now deleted: every Dashboard row routes
    to a real screen as of this step, so nothing calls it anymore.
    <br><br>
    Tested with jsdom, including a real jsdom-environment gap worth naming:
    this version of jsdom implements the `PointerEvent` constructor but not
    `Element.prototype.setPointerCapture`/`releasePointerCapture` at all
    (confirmed directly, not assumed) -- real browsers always have both, so
    the test file no-ops them on `Element.prototype` rather than adding
    defensive optional-chaining to the real component for an API gap that's
    test-environment-only. Covered: initial multi-zone render (rects, tags,
    checkbox states, no handles until selected), selecting a zone (handles
    + gamma slider + live size label appear), a checkbox toggle's immediate
    PUT, a gamma-slider PUT with live readout, a corner drag's live geometry
    update and PUT, the opposite-corner clamp actually preventing an
    inverted rect under a real synthetic drag, the drag-coalescing behavior
    under synchronous rapid-fire pointer events, Save navigating straight
    back with nothing further to persist, the empty-zones/no-live-output/
    load-failure states, and the full `DashboardScreen` round trip (real
    zone count in the nav-row label, click-through, Back). Also verified
    live against the real Windows binary: both new static files serve with
    real 200s, and `GET /api/zones` against a fresh install returns the
    real (Hue-with-no-reachable-bridge) empty-zones shape this screen's own
    empty state renders correctly for. The *successful* live-drag path
    against a real bridge's real zones couldn't be exercised live for the
    same reason step 14's own PUT testing couldn't: no real Hue bridge is
    reachable in this dev environment, so there are zero real zones to drag
    -- covered instead by the jsdom drag/coalescing/clamp tests above.

16. Backend: Stop endpoint — Added a real remote-shutdown route, matching huenicorn's own confirm-then-exit behavior.
 `POST

    `/api/stop`, added to both apps' `main.cpp` (app-layer, like the step 11
    monitors/reload routes — it needs `g_stopRequested`, a per-process
    global, so there's no core-level generalization available the way
    `ZoneRoutes` had). Confirmed by reading huenicorn's own real source
    first, not assumed from the frontend spec alone: `WebUI.js`'s
    `_stop()`/`_askStopConfirmation()` (the frontend half, already noted as
    "directly portable, close to verbatim" in this doc's Dashboard section)
    POSTs to a server route that calls `CoreService::stop()` →
    `Runtime::stop()` → `m_keepLooping = false` — i.e. **Stop shuts down the
    entire daemon process**, not a pause/resume toggle. Aurora already had
    the exact equivalent flag: `g_stopRequested`, the same `volatile bool`
    (Windows) / `volatile std::sig_atomic_t` (Linux) the existing Ctrl+C/
    SIGINT handler already sets, checked by the same tick loop. The route
    is a two-line body: write `{"succeeded": true}`, then set the flag —
    the daemon exits through its *existing* normal shutdown sequence
    (loop exits → `pipelineHost.shutdown()` → `main()` returns →
    `httpServerThread`'s own destructor stops this same server), the same
    path Ctrl+C already took, not a new one built for this endpoint. No
    resume exists, matching this build order's own "Pause is cut for v1"
    decision (`Orchestrator` has no concept of holding without exiting its
    loop) — confirmed this maps onto a real upstream behavior (huenicorn
    has no resume either) rather than being an Aurora-specific gap.
    <br><br>
    One real sequencing question worth confirming live rather than assuming
    from reading the code: does the HTTP response actually reach the client
    before the process that's about to exit tears down the very server
    sending it? cpp-httplib finishes writing a handler's response on its
    own listener thread independently of when the tick-loop thread (a
    separate thread) next checks the flag and starts shutting down — but
    only testing proves the ordering is actually safe in practice, not just
    plausible from reading two independent threads' code side by side.
    <br><br>
    Verified live on both platforms: `POST /api/stop` returns a real
    `{"succeeded":true}` with HTTP 200 delivered successfully every time,
    and the process then exits on its own within ~1-2s with no forced kill
    needed, logging "Stopping..." from the existing shutdown path — checked
    by polling the real OS process list (`tasklist`/`kill -0`), not the
    Bash-visible `$!` PID, per this doc's own already-filed lesson about
    that PID mismatch on Windows. No Catch2 test added: there's no pure
    logic here to unit-test in isolation (a two-line handler flipping an
    existing global), and the live end-to-end check already covers the one
    thing worth confirming for real -- that the response actually lands
    before the server that sent it goes away.

17. Dashboard, filled in — Added the quick mode toggle and a confirm-then-Stop button to the Dashboard, finishing the last individual screen.

    the quick segmented mode toggle and a Stop button (with a real confirm overlay) now sit
    above `DashboardScreen`'s nav rows. Reuses two things unchanged rather
    than re-inventing them: `forms.css`'s `.segmented`/`.segmented-btn`
    (step 12) for the toggle, and `ModeDeviceScreen`'s own exported
    `pickVideoInputName`/`pickAudioInputName` for resolving which real
    registry name the toggle actually writes — this quick toggle skips
    that screen's own device-picking step entirely (no monitor/sink
    choice), just flips mode using whatever device was already configured,
    matching the mockup's own "fast one-tap switch" intent.
    <br><br>
    **Two real inconsistencies resolved against the original spec, not
    silently built around:**
    - The layout mockup still drew a "⏸ Pause" button next to the toggle
      and Stop — left over from before this same doc's own Dashboard
      section explicitly cut Pause for v1 ("`Orchestrator` has no concept
      of holding without exiting its loop"). Another instance of this plan
      doc's own sections drifting out of sync with each other (see
      `Analysis/lessons/web-ui.md`'s already-filed entry on this) — not
      built, per the cut that was already made elsewhere in the same doc.
    - The mockup's status badge says "● Streaming," which would claim a
      live DTLS-connection health signal Aurora doesn't have and can't
      honestly show: `HueOutput::init()` succeeding is not proof a real
      streaming connection exists (`DtlsClient`'s handshake failure is
      swallowed by design, already filed in `Analysis/lessons/output.md`).
      Shows "● Running" instead, once this screen's own capabilities probe
      succeeds — an honest claim (this screen only renders because the
      daemon answered a real request), not a fabricated one about a
      connection state nothing in this build can actually verify.
    <br><br>
    **Confirm-overlay component generalized, not duplicated.** `index.html`
    already had one modal (`#settings-overlay`/`#settings-scrim`/
    `#settings-panel`, ID-based, singleton). Rather than copy those exact
    rules under new IDs for a second modal, added a class-based
    `.overlay`/`.overlay-scrim`/`.overlay-panel` trio to `forms.css` with
    the same real values, and built the Stop confirmation on those classes.
    The Settings modal itself was left exactly as it was — refactoring an
    already-shipped, already-tested modal onto the new classes would be a
    pure behavior-preserving change with no benefit to this step's actual
    job, not worth the regression risk.
    <br><br>
    Stop itself is close to verbatim from huenicorn's own real `WebUI.js`
    (confirmed again by reading it, not just recalling this doc's earlier
    research note): confirm/cancel overlay → `POST /api/stop` → a static
    "stopped" info panel on success, with no further navigation and no
    actionable buttons — a deliberate dead end, since the daemon process
    (including the very server that would answer any further request) is
    already exiting by the time that response arrives.
    <br><br>
    Tested with jsdom: the status pill's text, the toggle appearing only
    when `audioInputs` is non-empty (and Stop still present when it isn't),
    a full mode-switch round trip asserting the exact PUT body and the
    nav-row labels refreshing from the real endpoints afterward, a
    mode-switch `reloadError` leaving the toggle showing the *old* mode
    rather than a fake new one, the confirm overlay opening/closing on
    Cancel with zero requests sent, a successful Stop reaching the
    dead-end "stopped" panel, and a failed Stop staying on the confirm
    phase with an inline error and a re-enabled button rather than getting
    stuck disabled. Also verified live against the real Windows binary:
    the updated `DashboardScreen.js` serves with a real 200, a real mode
    switch via the exact PUT body the toggle sends succeeds with the
    process staying alive, and `POST /api/stop` through this same build
    once more confirms the full real shutdown sequence (a real 200
    response, then the process exiting on its own within ~1-2s, `tasklist`-
    confirmed).
    <br><br>
    This was the last of the individual build-order screens/backend pieces
    — steps 18 (full first-run-vs-returning-user routing) and 19 (a
    cross-width QA pass) remain, plus the deliberately-last MJPEG/SSE
    preview streaming endpoints.

### Wiring and Polish

18. First-run vs. returning-user routing — Replaced the "always open the Dashboard" placeholder with real logic that walks a new setup through only whichever steps are actually still missing, while a fully-configured install lands straight on the Dashboard.

    `app.js` replaced its step-9 stand-in (always navigate straight to Dashboard) with a real `probeState()`/
    `bootstrap()` pair implementing the Navigation model diagram.
    <br><br>
    **Not an all-or-nothing "first run" flag.** `probeState()` checks each of
    the three gating conditions independently — `needsOutputConnect` (Hue
    compiled in and `/api/hue/connection` not `configured`), `needsModeDevice`
    (neither `activeInputName` nor `activeAudioInputName` matches a real
    compiled-in name from `/api/capabilities`), `needsZoneMapping` (video mode,
    real zones exist, and every one is still at `reconcileZoneMap`'s own
    default — `active:false`, full-frame `uvs`, confirmed by reading
    `core/Runtime/src/ZoneReconciler.cpp` and `ZoneMap.hpp`'s real defaults
    rather than assuming what "unconfigured" looks like). A partially-set-up
    daemon (bridge paired, capture mode never chosen) resumes at exactly the
    step still missing, not from scratch — the diagram's own per-box
    "SKIPPED if already valid" annotations, generalized to apply
    independently to whichever box actually needs it, not just the one
    (Output Connect) the diagram happened to draw the annotation on.
    <br><br>
    **Tuning has no "already done" signal, so it isn't gated at all** — once
    *any* of the three conditions above is unmet, the chain always ends on
    Tuning before Dashboard (matching the diagram's own lack of a "SKIPPED"
    annotation on that box, unlike its neighbors). Since `TuningScreen`'s own
    Save intentionally never navigates away (step 13's "save in place, keep
    tweaking" design), it needed a new `showContinue` constructor option
    (this step's only screen-behavior addition, not just wiring) adding a
    second, separate Continue button for this one context — the hub-and-spoke
    path (`showContinue` defaulting `false`) is completely unchanged.
    <br><br>
    **Back decoupled from "done," not just relabeled.** All four onboarding
    screens previously hardcoded `onBack: () => this.onComplete()` — correct
    for a hub-and-spoke visit (Back and Done both mean "return to Dashboard"),
    wrong for a linear wizard step (Back needs to reach the *previous* step,
    not silently re-trigger Save/Finish). Each of `OutputConnectScreen`/
    `ModeDeviceScreen`/`ZoneMappingScreen`/`TuningScreen` now takes optional
    `onBack`/`showBack` constructor fields, defaulting to `onBack ?? onComplete`
    and `showBack = true` — every existing Dashboard-driven call site (which
    only ever passes `{ onComplete }`) keeps its exact original behavior with
    zero changes needed there. `app.js`'s chain passes a distinct `onBack`
    (a zero-arg closure that just re-navigates to whichever step ran right
    before this one) and `showBack: previousStep !== null`, so Back only
    disappears on whichever step the chain actually starts on — extending the
    doc's own "`← Back` absent on Output Connect during first-run" rule
    (written when Output Connect was assumed to always be first) to "absent
    on whichever screen the chain actually opens with," since a returning
    user missing only their capture-mode config now correctly starts the
    chain at Mode+Device instead, with no earlier step to point Back at.
    Re-navigating to a previous step re-mounts it fresh rather than restoring
    in-progress edits — acceptable since every one of these screens already
    reloads its own state from the backend on `mount()` regardless.
    <br><br>
    **Real bug found and fixed in passing, unrelated to routing itself:**
    `index.html` never linked `styles/zone-mapping.css` — built in step 15,
    it had been rendering completely unstyled in every real browser since,
    caught only now because this step made Zone Mapping newly reachable from
    a cold boot rather than only via a manual Dashboard click. jsdom's own
    tests never load stylesheets at all, so nothing in the existing suite
    could have caught a missing `<link>` — this needed an eyes-on read of
    `index.html` itself.
    <br><br>
    Tested with jsdom, driving `app.js`'s real bootstrap (not a mock of it)
    against a mocked backend: all-valid state resolves straight to Dashboard
    with no onboarding screen shown; bridge-unconfigured-only opens on Output
    Connect with Back hidden; bridge-and-mode-both-unconfigured chains Output
    Connect (real pairing flow, one entertainment config) into Mode+Device
    with Back now visible and confirmed to return to a freshly re-mounted
    Output Connect rather than Dashboard; zones-all-still-default-inactive
    opens directly on Zone Mapping (no Back, since it's the first screen this
    time) and Save chains into Tuning's new Continue button, which reaches
    Dashboard; capabilities unreachable at boot renders a small dedicated
    "Could not reach the daemon" / Retry state (an ad hoc `{mount,unmount}`
    object passed straight to `app.navigate()`, not a new screen class for a
    one-button dead-end). Also verified live against the real Windows binary
    with a fresh `AURORA_CONFIG_DIR` and dummy Hue env vars (bridge genuinely
    unconfigured, mode genuinely unset): confirmed `index.html`/`app.js`/
    `styles/zone-mapping.css` all serve correctly from the live sibling
    checkout with no rebuild needed (`AURORA_WEBUI_SOURCE_DIR` points at the
    real checkout, not a copy), the real boot opens on Output Connect with no
    Back, and submitting a real (nonexistent-on-this-network) bridge address
    surfaces the screen's own real "Couldn't reach a bridge at that address"
    error after a genuine network-timeout wait — the full real HTTP round
    trip, not a mocked one.

19. Cross-width QA pass — Rendered every screen in a real browser for the first time (not just jsdom) and found three real layout/interaction bugs — distorted SVG drag handles, a badge silently swallowing zone-select clicks, and a two-button row that didn't stack on phone width — all fixed on the spot.

    a real Chromium (Playwright, installed into the session scratchpad — not
    a repo dependency, this WebUI has no build step to add one to), not
    jsdom, since jsdom never lays out CSS or SVG at all and every finding
    below depends on real layout. Aurora-WebUI's own static files served
    as-is by a throwaway local static server, with `page.route()`
    intercepting every `/api/*` call — full control over each screen's data
    (a realistic 8-zone grid, both capture modes, every Output Connect
    phase) without needing a live daemon or a real Hue bridge. 32
    screenshots across all 5 screens' real/edge states at two real widths
    (1280px desktop, 390px constrained — an actual phone width, not a round
    number), plus an automated `scrollWidth` check confirming none of them
    overflow their viewport horizontally at either size.
    <br><br>
    **Three real bugs found by actually looking, not by re-deriving the
    layout on paper — none of them catchable by the existing jsdom suite:**
    <br><br>
    1. **Zone Mapping's drag handles rendered as ellipses, not circles, and
    the selected-zone size readout rendered as squished, overlapping text.**
    Root cause: the canvas SVG's `viewBox="0 0 100 100"` with
    `preserveAspectRatio="none"` deliberately stretches non-uniformly to
    fill the 16:9 box — correct and necessary for the zone *rects*
    themselves (UV space should map directly onto the box), but that same
    stretch silently distorts any *fixed-size* shape or text drawn in the
    same coordinate space. Measured directly in Chromium: a `.zm-handle`
    meant to be a circle came out ~24×14px. Fixed by moving both the corner
    handles and the size label out of SVG into the existing plain-HTML
    `.zm-overlay` layer (the same approach the zone-ID/checkbox tag already
    used, for the same reason) — handles positioned by percentage
    left/top (undistorted for a fixed-px HTML element, unlike an SVG
    shape), the size label positioned in real measured pixels
    (`svg.getBoundingClientRect().height`) with a fallback that flips it
    from "above the rect" to "just inside the rect's top edge" once the
    rect is close enough to the canvas's own top edge that "above" would
    clip under `overflow: hidden` — replicating what the original SVG
    version's baseline-clamp was already trying to do, correctly this time.
    <br><br>
    2. **The centered zone-ID/active-checkbox badge silently ate clicks
    meant to select the zone.** Found by literally trying to click a zone
    in a real browser while writing this pass's own automation (Playwright
    reported the click landing on the checkbox, not the rect). The badge
    sits dead-center on the zone — exactly where clicking-to-select most
    naturally lands — and `pointer-events: auto` on the whole badge
    (needed so its own digit/checkbox are clickable) meant *any* click
    anywhere in the badge's small bounding box, including its own padding,
    was swallowed with no listener attached, never reaching the rect
    underneath. Fixed by flipping the badge itself to `pointer-events:
    none` and re-enabling it only on the digit span and the checkbox
    specifically — a click on the badge's padding now falls through to the
    rect's own selection handler, while the digit and checkbox keep their
    own distinct jobs (select, toggle active) exactly as before.
    <br><br>
    3. **Output Connect's pairing-phase "Change address" + "Continue" pair
    didn't actually stack at constrained width.** The existing `@media
    (max-width: 480px)` rule set `.oc-actions .btn { width: 100% }` and
    `justify-content: stretch`, written against the entry phase's
    `.oc-actions` (which only ever holds one button, Continue — trivially
    "full width" there). The pairing phase's own `.oc-actions` holds two
    buttons in the same still-`flex-direction: row` container; two
    100%-wide flex children in a row don't stack, they just both shrink to
    fit. Measured directly (390px viewport): each button came out ~170px
    instead of the intended full ~343px. Fixed by adding `flex-direction:
    column` to the same media query, matching the treatment `.oc-address-row`
    already got right — verified afterward at 343px/full-width, stacked.
    <br><br>
    One more real bug (`index.html` missing the `zone-mapping.css` link)
    had already been found and fixed during step 18, for the same
    underlying reason: nothing before these last two steps had ever
    actually rendered these screens in a real browser.
    <br><br>
    Everything else checked out as designed, not just "not obviously
    broken": the shell's own title-truncation-with-ellipsis rule (`←Back
    Connect to your Hue B… ⚙`) degrades to legible, sensibly-cut text at
    390px exactly as its documented tradeoff intends, not garbled; Tuning's
    2-column desktop grid correctly collapses to one column at constrained
    width with a full-width Save; the Dashboard's mode-toggle-+-Stop row
    correctly stacks into two rows at constrained width rather than
    cramming (confirming this doc's own layout lesson, see
    `Analysis/lessons/web-ui.md`); and the real 8-zone grid (this doc's own
    "~8 zones" assumption, not a token 2) renders with clearly separated
    touch targets at 390px, confirming that lesson's own conclusion against
    real rendered pixels rather than napkin math for the first time.

**Deliberately last, not first:** the MJPEG+SSE preview streaming endpoints.
Worth building only if the live-preview cut gets revisited, not as a
prerequisite for anything above.
