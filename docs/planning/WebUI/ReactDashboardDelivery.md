# React Dashboard and NUX: build and delivery

Decision note for Aurora-4nqt.1. Covers how the React Dashboard and onboarding
screens are built, shipped and consumed by the demo while the vanilla `web/ui`
still exists. Epic: Aurora-4nqt.

Id: react-dashboard-delivery

## Decision

- **Option A.** Dashboard and NUX pages join the existing `web/graph-editor` Vite
  project as extra entries. No second npm project, no second lockfile, one
  Grille pin.
- The project keeps its directory name for now. A rename (`web/app`?) touches
  CMake, CI, docs and lessons for no user benefit, so it is a separate bead
  if wanted after the flip.
- One build output (`dist`) holds the editor and the Dashboard bundle. CMake
  embeds it once, as `Aurora::GraphEditorWebRoot::files`, served under
  `/graph-editor/` as today.

## How the main page loads the bundle

- `web/ui/index.html` stays the Dashboard page at `/`. It loads one island
  entry from `/graph-editor/` (root-absolute, since the page is not under that
  prefix).
- The build uses `base: './'`, so the island entry needs a **stable file name**
  (`islands.js`, `islands.css` via `entryFileNames` and `assetFileNames` for
  that entry only). Its chunks stay hashed and are imported relative to it.
  Aurora-4nqt.3 proves this.
- The editor's `index.html` entry is unchanged.
- Islands are mounted with Grille `mountIsland` into slots that vanilla code
  never touches. One owner per DOM region.

## Node policy

- Node >= 22.12 with `npm ci` and `ignore-scripts`, exactly as in
  `docs/Building.md`. No new prerequisite.
- App presets already turn `AURORA_ENABLE_GRAPH_EDITOR` ON. A bare slice
  configure stays OFF until the flip.
- `AURORA_GRAPH_EDITOR_DIST=<dir>` keeps skipping npm. The prebuilt dir now
  carries the Dashboard entry too. Packagers with no network build once and
  pass it, same as today (Linux packaging, SteamOS notes).
- **Flip impact (Aurora-4nqt.11):** once `app.js` is React the Dashboard cannot
  run without the bundle, so Node (or a prebuilt dist) becomes mandatory for
  every app build. At that point:
  - retire the OFF path for app presets, keep the option only for slice dev
  - rename the option to `AURORA_WEBUI_BUNDLE` and `AURORA_WEBUI_DIST`, with
    the old names accepted as deprecated aliases for one release
  - update `Building.md`, the Dashboard "Edit graph" probe (no longer needed)
    and the "no Edit graph link" text
- **Before the flip**, the first island that replaces a vanilla piece
  (Aurora-4nqt.4) makes that piece bundle-dependent. Decision needed from the
  owner (see Open questions).

## How web/demo consumes the bundle

- `vendor/build-editor.py` already runs `npm run build` and copies `dist` to
  `web/demo/graph-editor/`. It keeps doing so, and the island entry rides along
  at `graph-editor/islands.js`, loaded by the demo `index.html` by relative path.
- The demo shim (`demo-editor-frame.js`, `window.auroraDemo`) must be installed
  before any island fetches `/api/`. For islands in the main demo page this is
  `demo-boot.js` order. For the editor iframe it stays `demo-editor-entry.js`.
- `pages.yml` already runs the Vite build, so no new workflow. It gains a check
  that `_site/graph-editor/islands.js` exists.
- `vendor/webui` stays committed and synced during coexistence. It retires with
  the flip (Aurora-4nqt.11), after which the demo builds the bundle only and the
  sync script, manifest, seams test and CI drift check go.
- Grille comes from a GitHub release tarball, so the demo deploy depends on
  that release staying available (already true for the editor).

## Coexistence rule while vanilla and React both ship

- Sequence: shell island, leaf islands, NUX screens, Dashboard, then flip.
- Vanilla keeps owning state, routing and polling until the flip. Islands get
  props through a small mount API and report events back. No island fetches
  state that vanilla also fetches, so there is one source of truth per value.
- A piece is replaced in one change: the island lands and the vanilla
  implementation goes, with its node test. No dual rendering of the same
  piece.
- Any `web/ui` edit still needs the demo vendor sync and the node tests.
  Island code lives in `web/graph-editor/src` and is covered by vitest, so
  `web.yml`'s `graph-editor` job already gates it.
- Shared styling: tokens stay in `web/ui/styles/tokens.css`. Aurora-4nqt.3
  checks Grille `ui.css` against the tokens globals and the `:focus-visible`
  rule before any island ships.
- Shared logic with the editor (error shell rows, snapshot and pulse state)
  moves into shared hooks, not copies. Aurora-4nqt.2 then .4 do this first.

## Open questions for the owner

- Is a Node-less app build still supported between the first replacing island
  and the flip? Recommendation: no. Presets already require Node, so declare
  the bundle mandatory from Aurora-4nqt.4 and let `-DAURORA_ENABLE_GRAPH_EDITOR=OFF`
  build a Dashboard-less dev slice only.
- Rename the project directory after the flip? Recommendation: defer.
