# Low-scope implementation plan

Id: implementation-plan

Status: active, trimmed 2026-09-29 (Aurora-d8g) — this doc used to carry
every phase's full narrative; the shipped ones (phases 1, 2, 2.5, and
Phase 3 Milestone 1) moved to [[implementation-plan-early-phases]] and
[[implementation-plan-phase-3]], and the superseded directory-layout
sketch moved to [[implementation-plan-directory-layout]]. What's left
here is genuinely still open: guiding principles plus phases 4/5 and the
stretch list.

Five phases to prove out the Input/Processing/Output split
([`archive/ModuleSplitPlan.md`](../archive/ModuleSplitPlan.md)) as a real, running vertical slice,
plus one deferred stretch. Order matches how the phases were scoped. Phase
2.5 (audio) was inserted later, independent of phases 3–5 — it doesn't
renumber anything since it isn't sequentially gated by the browser work.

## Guiding principles
Status: standing — principles, not a milestone.

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
  unrelated plugins. See `archive/ModuleSplitPlan.md`'s "Repo split" section for the
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
  needs from it, what maps directly vs. what needs rework). Goes in `docs/`
  alongside `archive/FirstScan.md`. This is what "holistic view before starting" means
  in each phase below — not a one-time exercise, a per-section step every
  phase repeats.

## Phases 1–3 Milestone 1: shipped

Directory layout, and phases 1/2/2.5's full build narrative, moved to
[[implementation-plan-directory-layout]] and
[[implementation-plan-early-phases]] (Aurora-4li/m4f/ljj, all closed).
Phase 3 Milestone 1 (the browser demo, Aurora-xcb, closed) and Milestone
2's original — never-built, superseded — design both moved to
[[implementation-plan-phase-3]]; what actually shipped for the native
WebUI is [[webui-design-1st-pass]]/[[webui-design-2nd-pass]]/[[webui-fixes]].

## Phase 4 — Extend to WebXR (reference RockyRoad)
Status: unbuilt.

Same phase-3 scene, made viewable in a headset — reusing RockyRoad's
already-solved groundwork instead of rediscovering it.

- **Analysis pass first**, and this one doubles as the source for the next
  bullet: read
  RockyRoad's `dev-environment` and `xr-3d-rendering` engine lessons,
  and write `docs/RockyRoadXRAnalysis.md` covering RockyRoad's actual
  IWSDK/Scene3D/Camera3D scaffolding holistically (not just the lessons list —
  the working code itself: `v2/src/`'s engine layer) before bootstrapping
  milestone 2's browser client from it (repo TBD, see
  [[implementation-plan-phase-3]]). The Windows/Vite/IWSDK setup gotchas and the local-Z
  camera-fixed-HMD rendering pattern are already documented in those lessons
  files; no need to rediscover them.
- Bootstrap from RockyRoad's IWSDK setup
  (its `v2/ARCHITECTURE` doc) rather than from
  scratch — "put 3D content in a WebXR headset via Vite + IWSDK" is generic
  scaffolding, not note-highway-specific, so it's a legitimate distillation
  target the same way ChartPlayer's engine layer was distilled into RockyRoad.
- **Shared-util-library candidates — flag, don't build.** If the analysis pass
  above turns up pieces of RockyRoad's custom XR logic (`Camera3D`, the
  local-Z helpers, IWSDK bootstrap glue) that are genuinely generic rather than
  note-highway-specific, note them in `docs/RockyRoadXRAnalysis.md` as
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
  mbedtls link, see [[implementation-plan-phase-3]]); the remaining gap is cert-trust *distribution* to
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
Status: unbuilt.

Wires ISF shaders in as the actual visual-effect layer for the browser/WebXR
output, per `archive/OpenFormatsResearch.md`'s finding that ISF fits this target better
than any lighting-specific format.

- **Analysis pass first:** `docs/ISFRendererAnalysis.md` — read
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
Status: deferred.

- **Networking fork: WebSockets.** Once bandwidth or bidirectional control
  (WebXR pose back to the native core, browser-side effect selection persisted
  server-side) actually need it, replace phase 3's SSE+chunked-MJPEG channel
  with a WebSocket one (new dependency — e.g. uWebSockets, IXWebSocket, Boost.Beast).
  Not needed for phases 1–5 to work end to end. **This is also the fork
  where the open one-seam-vs-double-seam question in
  `archive/DistributedArchitecturePlan.md` needs an actual answer** — pick it up
  again when this stretch goal gets picked up, not before.
- **Object detection (YOLO-style)** — designed in `archive/OpenFormatsResearch.md`, not
  part of this pass; slots into `Processing` after phase 5.
- **Additional Output targets** (DMX/Art-Net/sACN, OPC/DDP) — deferred the same way.
- **Dynamic/hot-swappable plugin loading** — only revisit if compile-time module
  selection actually becomes a real pain point (e.g. wanting one binary to
  support many outputs without recompiling).
