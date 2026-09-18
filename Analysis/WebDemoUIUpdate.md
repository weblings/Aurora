# Web Demo Dashboard Port — Plan (WebDemoUIUpdate.md)

## Goal

Port the Dashboard (not NUX) from Aurora-WebUI into Aurora-Demo-Web so it
hooks up and behaves as on the real app, while the Demo stays a static page
on GitHub Pages with no backend. The port reads and writes through an
in-page shim that implements the Dashboard's exact `/api/*` contract; the
Demo's ported DSP math is already current and needs no changes. The page is
a 50:50 split view: on 16:9 landscape the three.js scene takes half the
screen and the Dashboard the other half; on 9:16 portrait the scene takes the
top half with the Dashboard in the bottom half. OrbitControls stay live on the scene while the
Dashboard pane scrolls and operates independently, and the Demo's own
source-mode dropdown goes away once the Dashboard's Audio/Video toggle
drives the source.

## Success Criteria

- The ported Dashboard boots on the static page with zero NUX screens and no
  "couldn't reach the daemon" states.
- Every Dashboard control from the real app is present; each one either
  changes the Demo's visible output / persisted state exactly as on the app,
  or is listed in an explicit no-op ledger with its decided disposition.
- Shim responses conform to the backend's real route shapes (mechanical
  check, Section: Validation Plan).
- `processing.js` / `smoother.js` / `audioFeatures.js` / `colorModel.js`
  remain byte-identical to `Aurora/web-processing/` (copy-rule preserved).
- 16:9 shows scene + Dashboard side by side at half width each; 9:16 is a
  50:50 split with the scene on top and the Dashboard below. Orbit works on
  the scene without hijacking Dashboard scroll and vice versa.
- The Demo's source-mode dropdown is gone; the Dashboard Audio/Video toggle
  is the only source selector and the scene follows it.

## Context And Current Facts

- Demo snapshot 2026-09-16; today 2026-09-18. The four ported math files are
  byte-identical to `Aurora/web-processing/`, which is untouched since Sept
  16, and no core DSP (AudioProcessing, ImageProcessing, Smoother,
  compositors, Hue color path) changed in that window (git log verified).
- Demo `midpoint` audio preset == live `Config.hpp` persisted values
  (0.285/0.265/0.26/10°/s); `AudioProcessing.hpp` 0.45s are unreachable
  struct fallbacks (consumption path Config → ConfigStore verified).
- One zone shape delta since snapshot: zones gained `everConfigured`
  (`8c0da5d`). `zonemap.js` geometry convention still matches `ZoneMapStore`
  (gamma persisted, `ZoneMapStore.cpp:42,52`).
- All other movement is additive/adjacent: Test Pulse route + helpers,
  entertainment-rid fix, tooltip descriptors, PipeWire handoff and WASAPI
  staging-texture fixes. `Channel::setUV` has test-only callers.
- "Screen Division Coordinates" CSV: zero references in any repo. Ignore.
- WebUI facts grounding the shim: screens call bare global `fetch('/api/…')`
  (no DI); no polling anywhere (no `setInterval`/`setTimeout` in Dashboard,
  shell, or boot) — UI is load-then-PUT. PUT `/api/config` returns
  `{succeeded, reloadError?}` (save-then-rebuild semantics); PUT `/api/zones`
  takes per-zone `{zoneId, uvs}`; `entertainment-configurations` is a
  PUT-for-read with `{}` body; Tooltips fail silent without `/api/descriptors`
  (`Tooltips.js`, `topBar.js` native-title design). Dashboard line 383 can
  navigate to OutputConnectScreen (bridge setup) — must never trigger.
- Daemon serves one static dir (`serveStaticFiles(AURORA_WEBUI_SOURCE_DIR)`,
  sibling-fetch pattern in `Aurora-App-Linux/CMakeLists.txt:36-40`);
  `HttpServer` shows a single `m_staticDir`. No live per-zone color/audio
  endpoint exists anywhere in the route inventory.

## Constraints And Non-goals

- GitHub Pages: static only, no backend, no build step assumed. (User
  constraint; past agents established it.)
- Dashboard only. NUX screens (Welcome, ModeDevice, OutputConnect,
  EntertainmentZoneSelect, ZoneMapping screen) are not ported; the shim's
  canned `configured: true` keeps bridge-setup navigation unreachable.
- No changes to Aurora-WebUI structure to accommodate the Demo; WebUI stays
  the source of truth, Demo vendors copies (the `web-processing/` precedent).
- No `Co-authored-by` trailers on any commit; explicit commit authorization
  per change (standing user constraints).
- Non-goal: a release-embedding story (`EmbeddedWebrootFiles.hpp.in` is
  referenced but absent even for WebUI itself). The port must not depend on
  one appearing.

## Key Decisions

1. **In-page `fetch` router over Service Worker.** Intercepts only `/api/*`,
   delegates the rest (including `app.js`'s stylesheet-export fetches) to
   native fetch. ~30 lines, no build step, works on GH Pages *and* `file://`.
   Rejected SW: registration lifecycle + scope complications for zero gain
   when no push channel is needed (no polling in WebUI).
2. **Canned `configured: true` + one entertainment config + canned channels.**
   Keeps the port NUX-free by construction instead of stubbing NUX screens.
3. **Demo boot mounts DashboardScreen directly** rather than satisfying stock
   `probeState` with canned answers. Cleaner, and matches the Dashboard-only
   scope. (Assumption; reversible — stock boot would also pass against a
   fully-canned shim.)
4. **Zone geometry becomes live state.** `zonemap.js` `const` → mutable demo
   store; PUT `/api/zones` reshapes the Three.js rig; Arrange fans out one
   PUT per zone then reloads, same as the app.
5. **Per-key dispositions decided explicitly (no silent no-ops):**
   11 audio keys → direct map onto `colorModel.js` settings;
   `transitionSmoothing` → ported Smoother; `subsampleWidth` → Demo canvas
   sampling; `interpolation` → expose if the easing port allows, else ledger;
   `refreshRate` / `activeMonitorName` / `audioTargetSinkName` → round-trip
   with ledgered honest-no-op (recommended default; reversible per key).
6. **Stop button is skipped in the port** (decided). The daemon-shutdown
   semantic has no static analogue, so the vendored DashboardScreen copy
   drops the `trailingButton` wiring (`DashboardScreen.js:118-122`) — the
   fourth vendor seam. Full seam list, recorded in Phase 0: (1)
   OutputConnectScreen import cut, (2) minimal `app` facade in demo boot,
   (3) `shell.css` html/body scoping, (4) Stop wiring cut.
7. **Vendor three.js + glb locally in Phase 1** (drop unpkg CDN): backend-
   independent, required for offline/`file://` parity.
8. **localStorage persists demo config** across visits, matching `config.json`
   semantics (recommended default; reversible). No GitHub Pages blocker:
   same-origin storage with ample quota for config sizes. The one real
   hazard is private-mode browsers (Safari/Firefox may throw on access), so
   all store access goes through a try/catch helper with in-memory fallback.
9. **Same-DOM port, not an iframe.** One window keeps one fetch router, one
   shim, one three.js instance. The Dashboard mounts into its pane under the
   existing `#screen-container` id (kept unique); WebUI's bare `html`/`body`
   rules (`shell.css:18,23`) are audited in Phase 0 and scoped or accepted
   there, not worked around per component. Pane order decided: scene left,
   Dashboard right. Rejected iframe: a second window
   would need its own injected shim + router copy and its own three.js scene
   wiring, doubling every phase for style isolation that prefixed
   (`--aurora-*`, `.db-*`, `.top-bar-*`) classes already mostly provide.
10. **Scene pane owns its geometry.** The Demo's fullscreen resize handler
    (`main.js:772-781`, currently `window.innerWidth/Height`) is retargeted
    to the scene pane via ResizeObserver; camera aspect + renderer size
    follow the pane, so the 16:9/9:16 switch and any window resize stay
    correct. OrbitControls (already in the Demo, `main.js:91`, pivoting on
    the frame) keep `touch-action: none` on the renderer canvas only; the
    Dashboard pane is a separate scroll container (`overflow-y: auto`), so
    orbit gestures and dashboard scroll never compete.
11. **Dropdown removal waits for the toggle.** The Demo's source-mode select
    stays until Phase 4 wires the Dashboard Audio/Video toggle to the scene
    source; only then is it removed. `rainbow` is disabled, not deleted —
    option hidden, code path retained for later (decided).

## Recommended Approach

Phase the work so each phase ends with a verifiable static page: router +
store first (boots interactive), then boot, then zone writes, then tuning
writes, then parity details. Conformance test from Phase 1 onward so backend
shape drift (the `everConfigured` precedent) trips a test instead of rotting
silently.

## Work Plan

- **Phase 0 — Port boundary.** Enumerate DashboardScreen's import closure
  (TuningFields, EntertainmentConfigSelect, ZoneCanvas, DeviceField,
  Dropdown, ChannelList, ZonePatchQueue, Tooltips, AccordionSection,
  SliderFill, topBar + CSS/icons). Verify ZoneCanvas's video/canvas-source
  assumptions against the Demo scene — highest-risk include; cut or adapt
  before Phase 1. Audit WebUI CSS for bare-element leakage (`html`/`body` in
  `shell.css`, `#screen-container` id-uniqueness, `--aurora-*` var
  collisions) and decide scoping. Vendor whole files (decided) plus a
  manifest mapping each file to its WebUI source path + commit hash, and
  record the four vendor seams (Key Decisions §6). Decide the vendor
  location in Aurora-Demo-Web.
- **Phase 1 — Router + store + vendor + layout shell.** Fetch router
  (`/api/*` only); in-memory store seeded from live `Config.hpp` values;
  canned capabilities, connection (`configured: true`), single monitor,
  single entertainment config, canned channels; local three.js + glb; the
  split-view shell itself (16:9 side-by-side halves via aspect-ratio media
  query, 9:16 50:50 scene-over-dashboard split; scene pane with ResizeObserver
  driving camera/renderer per Key Decisions §10; Dashboard pane as its own
  scroll container hosting `#screen-container`). The old source dropdown
  stays put for now. *Validates: page boots to scene + interactive Dashboard
  on GH Pages at both aspect ratios; orbit and dashboard scroll independent;
  no daemon errors.*
- **Phase 2 — Demo boot.** Bootstrap mounting DashboardScreen directly with
  the ported CSS. *Validates: zero NUX, title/tooltips render.*
- **Phase 3 — Zone write path.** Live zone state; PUT `/api/zones` →
  rig re-render; Arrange flow end to end; seed includes `everConfigured:
  true`. *Validates: zone edits + Arrange persist (localStorage) and reshape
  the rig.*
- **Phase 4 — Tuning write paths + source handover.** Audio 11 keys
  (direct map), then video keys per Key Decisions §5, then the no-op ledger
  entries. Preserve last-write-wins coalescing behavior on rapid drags.
  Wire the Dashboard Audio/Video toggle to the scene source (video →
  real-video path, audio → audio path), then remove the Demo's source-mode
  dropdown and disable (not delete) `rainbow` per Key Decisions §11.
  *Validates:
  parity checklist per control vs the app at matched settings; toggle alone
  selects the source.*
- **Phase 5 — Parity details.** Static descriptors JSON (tooltip parity);
  Stop-button skip; portrait-gesture verification on a real phone
  (Risks §9).

## Validation Plan

- **Shape conformance (from Phase 1):** shim responses validated against the
  backend's Catch2 fixtures or a checked-in JSON snapshot per route; re-run
  on every vendor update. Highest-risk validation step: without it the port
  rots invisibly.
- **Behavioral parity checklist (Phase 4):** each Dashboard control through
  its full range on app vs Demo at matched settings — visible rig response +
  persisted state (localStorage vs `config.json`).
- **No-op ledger assertion:** every Key Decisions §5 no-op key has a ledger entry;
  the checklist asserts the ledger, not just behavior.
- **Copy-rule check:** `diff` demo math files vs `Aurora/web-processing/` —
  must be empty (existing convention, `CLAUDE.md`).
- **Mechanical probes:** descriptors/capabilities answers diffed against a
  running daemon's live `/api/*` output.
- Daemon-unreachable branches stay unverified by construction (in-page router
  never rejects) — accepted, not chased.

## Risks / Rollback

1. **Closure sprawl** — half of WebUI comes along unless the Phase 0
   boundary is deliberate (mitigated by Phase 0 audit, ZoneCanvas first).
2. **Shape drift without tripwire** — every backend shape change silently
   breaks the shim (mitigated by conformance test; residual risk accepted).
3. **PUT-for-read** (`entertainment-configurations`) will tempt a "fix" to
   GET — flagged in shim code.
4. **Coalescing** — artificial shim latency must preserve last-write-wins or
   rapid drags lag the app (mitigated: apply synchronously, no fake latency).
5. **Pre–Sept-16 silent drift** — DSP-current rests on identical copies +
   no-DSP-commits, not a fresh JS↔C++ audit. If matched-setting output looks
   off, suspect the mirror before the shim.
6. **Untestable error branches** — accepted (see Validation Plan).
7. **Half-pane squeeze.** The Dashboard was designed full-page at 640px max
   width; in a 16:9 half-pane (often ~800–960px CSS wide) it fits as-is, and
   portrait phones get the full width — but mid-size landscape windows could
   squeeze the pane below comfortable width. The accordion overhang (21px
   each side) assumes viewport-edge clipping (`shell.css:27-29`); inside a
   pane it needs pane-edge clipping instead. Phase 1 validates at 1920×1080,
   1366×768, and 390×844; if the squeeze bites, the pane gets its own
   min-width + horizontal scroll rather than redesigning the Dashboard.
8. **Two canvases, one page.** ZoneCanvas (2D zone overlay, if ported) and
   the three.js renderer run side by side in different panes — no shared-GL
   issue, but ZoneCanvas's sizing assumptions (full content column) must be
   rechecked inside the pane during Phase 0.
9. **Orbit vs pane gestures on touch.** Contained by Key Decisions §10
   (touch confined to the renderer canvas), but verify on a real portrait
   phone: a 50vh canvas swallowing all vertical swipes over it is correct
   orbit behavior, not a scroll trap, only if the Dashboard pane is
   reachable without crossing the canvas.
- **Rollback:** the Demo is static; every phase is revertible to the current
  page. No backend, migration, or data-safety dimension.

## Open Questions

- Who re-vendors on WebUI change (which side owns running the manifest +
  conformance check)? Whole-file copying is decided; only the ownership
  rotation is open.
