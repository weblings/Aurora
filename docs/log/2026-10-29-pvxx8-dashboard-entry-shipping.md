# E5: Dashboard entry point and shipping the editor

Id: pvxx8-dashboard-entry-shipping

`Aurora-pvxx.8`, from [[sequence-e-planning]]: the editor is reachable from the
Dashboard and built into every app preset.

## Done

- **Edit graph link** (`web/ui/screens/DashboardScreen.js`, `graphEditorHref`
  in `CaptureSource.js`): under the mode toggle, `/graph-editor/?effect=<id>`
  for the running effect (`/api/state` `effect`). It shows only after a GET of
  `/graph-editor/` returned HTML, so editor-less builds and the demo shim show
  no dead link. The effect picker stays `Aurora-kep2`.
- **On for packaged builds:** `AURORA_ENABLE_GRAPH_EDITOR=ON` in the
  `linux-app`, `windows-app` and `mac-app` presets (CI already passed it). A
  bare slice configure stays OFF; `-D...=OFF` on a preset opts out.
- **Building.md:** Node >= 22.12 added to the prerequisites; graph editor
  section rewritten for the new default, Dashboard link, Linux packaging and
  macOS signing order.
- **Mac bundle and signing order:** no code change needed. The build stages the
  notice, `bundle-licenses.sh` preserves it, `bundle-dylibs.sh` runs it before
  signing. **Linux** notice is `install(FILES)`, which honours `DESTDIR`; the
  offline path is `AURORA_GRAPH_EDITOR_DIST` (npm skipped).

## Verification

- Mac: `cmake --preset mac-app` in a scratch dir built with the editor
  embedded (binary holds `/graph-editor/assets/index-*.js`); `bundle-dylibs.sh
  --identity -` then `verify-bundle.sh` PASS and `codesign --verify --deep
  --strict` exit 0, notice present under `Licenses/graph-editor/` and named in
  `THIRD-PARTY-NOTICES.txt`. Not run through a live HTTP request, and not
  Developer-ID signed or notarized.
- `web/ui`: `DashboardScreen.test.mjs` (link hidden until probed, href encoding,
  hidden with no effect, probe ok/non-ok/offline) and `CaptureSource.test.mjs`.
- Not verified: Windows and Linux packaged builds (CI builds them with the
  option ON; no local machine), `/graph-editor/` served by a packaged binary.

## Lessons

none
