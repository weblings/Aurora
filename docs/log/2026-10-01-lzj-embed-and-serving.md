# Aurora-lzj: toolchain spike investigated, change A (embed + serving) done; HA prep filed

Id: lzj-embed-and-serving

Paused, not closed: `Aurora-lzj` (node-prep item 5 of [[node-graph-pipeline]])
is in progress. Change A is done on Linux; change B (the npm/Vite build) hasn't
started. The same session filed the Home Assistant prep beads.

## Beads and planning

- Imported `.beads/issues.jsonl` (244 issues) from the `feat/NodesPrep` merge.
- [[home-assistant-output]]: new "Prep work" section; five `ha-prep` beads
  (Aurora-pp8 Info.plist local-network string, Aurora-dwo httplib >= 0.46,
  Aurora-4y9 output-neutral NUX probe table, Aurora-a0r output-neutral
  zone labels, Aurora-d9v ws client build check). These need no new
  dependency and don't commit to building HA.
- lzj made opt-in: as first written, every app build would have needed Node.
  It now sits behind `AURORA_ENABLE_GRAPH_EDITOR` (off by default), with
  sources in `web/graph-editor/` and output in the build dir, never under
  `web/ui/`. The full decided plan is in lzj's design field.

## Investigation (scratchpad, Vite 8.3.2 / React 19.3 / @xyflow/react 12.12)

- Bundle: one 399 KB JS file (126 KB gzip) plus 17 KB CSS. The largest
  file embedded before was 40 KB.
- The old encoder round-tripped it on GCC (1.0 s, 92 MB). MSVC's believed
  ~64 KB cap on concatenated literals (C1091) is the one unverified risk.
- Minified output contains `??!`. Harmless in C++20, but GCC warns.
- Vite 8's built-in `build.license` lists all 17 bundled packages
  (MIT/ISC/BSD-3, all GPL-compatible), so no plugin is needed.
- Vite 8 needs Node ^20.19 || >=22.12. Chose a >=22.12 floor because Node
  20 reached end of life in 2026-04.
- `--ignore-scripts` works. Native parts (rolldown, lightningcss) are
  optionalDependencies with every platform listed in one lockfile, and the
  only install script is fsevents (optional).
- Vite doesn't empty an outDir outside its project (reproduced), so the
  CMake step needs `--emptyOutDir`.
- RockyRoad v2 / RockyRoadImport: `base` doesn't rewrite runtime strings
  (build asset URLs from `import.meta.env.BASE_URL`); a Vite dev-server
  proxy for `/api` gives the dev loop; caret ranges let their two projects
  drift onto different Vite majors, so pin exact versions.
- [[future-steamos-support]]: Flatpak builds run offline. The plan is
  ready for that through a committed lockfile, plain `npm ci` (so
  `npm_config_*` env vars still apply), no install scripts, and an
  `AURORA_GRAPH_EDITOR_DIST` setting that skips npm.

## Change A

- `embed_webroot.py`: files over 60000 bytes become `std::string` pieces
  joined with `+`; `?` is emitted as `\?`; an optional namespace argument
  allows a second map.
- `HttpServer::serveEmbeddedFilesAt(prefix, map)`. Existing
  `serveEmbeddedFiles` callers are unchanged. Under the prefix, a
  trailing-slash path serves index.html and the bare prefix gets a 301 to
  `prefix/`. Routes are registered before the root fallback, and httplib's
  static mount falls through to them on a miss. Root and prefixed maps
  share `serveEmbeddedKey`. MIME table gains md, mjs, map, woff2, wasm
  and webp.
- Lambdas use init-captures rather than structured-binding captures,
  which need Clang 16+.

## Verification

- Linux: core 97/97 (3 new `HttpServer` cases, plus
  `AuroraEmbedWebrootTests`), linux-app 87/87, no warnings. The app's
  `EmbeddedWebRoot.hpp` regenerated through the new encoder; a compiled
  round-trip over all 67 `web/ui` files and the real 399 KB editor bundle
  matched byte for byte.
- Mutation check: un-isolating `\xNN` escapes makes
  `AuroraEmbedWebrootTests` fail, and restoring them makes it pass.
- Mac (Apple M5, Apple Clang), 2026-10-01: standalone `cmake -S core -B
  build-core-test`, clean rebuild, no compiler warnings, ctest 97/97
  (including the 400 KB fixture round-trip and the 3 new `HttpServer`
  cases). `build/mac-app` rebuilt: `EmbeddedWebRoot.hpp` (1.0 MB)
  regenerated through the new encoder, no compiler warnings (only the
  known macOS-14.2-vs-27.0 dylib linker warnings), app ctest 62/62.
- Not yet run: Windows (MSVC). App presets force core tests off, so use a
  standalone `cmake -S core -B build/core-tests` and
  `ctest -R "embed_webroot|HttpServer"`.

## Change B (editor build), Mac, 2026-10-01

Built on Mac only; Linux and Windows edits are written but not built.

- `web/graph-editor/`: exact-pinned `package.json` (vite 8.3.2, react 19.3.0,
  @xyflow/react 12.12.0, @vitejs/plugin-react 6.1.1, typescript 7.0.2),
  committed `package-lock.json`, `.npmrc` (ignore-scripts, engine-strict),
  `vite.config.ts` (base `/graph-editor/`, `build.license`, `/api` dev
  proxy), hello-world React Flow app that builds asset URLs from
  `BASE_URL` and fetches `/api/version`. `npm run typecheck` is clean.
- `web/graph-editor/cmake/GraphEditor.cmake`: declares
  `AURORA_ENABLE_GRAPH_EDITOR` (OFF) and `AURORA_GRAPH_EDITOR_DIST`;
  `aurora_graph_editor_embed()` runs `npm ci` (stamped on the lockfile),
  `npm run build -- --outDir <bindir> --emptyOutDir` (stamped on a source
  glob), then embeds with the new `NAMESPACE`/`DEPENDS` arguments of
  `aurora_embed_webroot`. The three app CMakeLists include it; the three
  `main.cpp` call `serveEmbeddedFilesAt("/graph-editor/", ...)` under
  `AURORA_GRAPH_EDITOR`. The option lives in the module so one definition
  serves the superbuild and standalone slice configures.
- Notice shipping: Linux `install(FILES ...)` into the doc dir; Windows an
  install rule into `Licenses`; Mac POST_BUILD copy into
  `Contents/Resources/Licenses/graph-editor/`, which
  `tools/mac/bundle-licenses.sh` now preserves across its wipe and lists in
  its index.
- Workflows: setup-node 22 and the option in linux.yml/windows.yml
  (`web/graph-editor/**` added to their path filters). Building.md and
  FutureSteamOSSupport.md updated.

Mac results (Apple M5, Node 22.23.3, build/mac-app):

- Option OFF (default): configure never looks for npm (`AURORA_NPM` not in
  the cache); `EmbeddedWebRoot.hpp` byte-identical to before (same sha1);
  the binary has no `graph-editor` strings.
- Option ON: `npm ci` plus vite build (399 KB JS, 17 KB CSS, notices file),
  embedded, linked, signature verifies, app ctest 62/62.
- Running app (`--fresh`): `/graph-editor` 301 to `/graph-editor/`; index 200
  `text/html`; the JS 200 `text/javascript`, byte-identical to the dist
  file; `icon.svg` and the THIRD-PARTY-NOTICES file served with the right types;
  `/` still serves the main WebUI.
- Rebuilds: touching `main.cpp` recompiles and relinks without rerunning
  vite; touching an editor source reruns vite and the embed; a no-change
  build does nothing.
- `bundle-licenses.sh` keeps the staged notice (checked with an empty dylib
  manifest; a real identity-signed bundle not run).
- Browser check: the user opened `/graph-editor/` from the running Mac app
  and confirmed it works (2026-10-01).
- Linux (Node 24.14, GCC), 2026-10-01: separate build dir with
  `cmake --preset linux-app -B build/linux-app-ge
  -DAURORA_ENABLE_GRAPH_EDITOR=ON` (cmake is the project `.venv` one, not on
  PATH). Clean build in 1m40s, 0 warnings; ctest 87/87. Touching
  `main.cpp` recompiled only that file (no vite or embed rerun). Ran the
  binary with `--fresh` and a throwaway `AURORA_CONFIG_DIR`: `/graph-editor`
  gives 301 to `/graph-editor/`, `/graph-editor/` 200 `text/html`, the
  399 KB JS 200 `text/javascript` and byte-identical to the built file, `/`
  still 200.
- Linux browser check: headless Firefox (separate profile; the snap refuses
  a second instance) rendered the React Flow canvas, Input/Output nodes
  with an edge, controls, and "server: 1.0.4" from the Aurora call. Only a
  screenshot; no interaction or console check.
- Windows (MSVC 2022 Build Tools, Node 24.19, npm 11.17), verified:
  - Standalone core build (`cmake -S core`, Release): no C1091, ctest
    97/97 incl. the 400 KB embed fixture and the 3 serveEmbeddedFilesAt
    NetworkTests. Only noise: MSB8029 (build dir under %TEMP%), C4996 getenv.
  - `windows-app` preset with AURORA_ENABLE_GRAPH_EDITOR=ON (separate dir
    build/windows-app-ge): configure 68s, build 2m40s, npm ci + vite ran,
    GraphEditorWebRoot.hpp ~1 MB, app ctest 70/70.
  - Live run: /graph-editor 301 -> /graph-editor/, 200 text/html; JS 200
    text/javascript, SHA256-identical to the Vite output (399180 B); CSS
    200 text/css; THIRD-PARTY-NOTICES.md 200; / still 200.
  - Touching LogSink.cpp: npm/vite not rerun (the cheap embed step does
    rerun on the VS generator).
  - Not done on Windows: browser render, OFF-header byte comparison.

## Resume

Nothing; Aurora-lzj verified on Linux, Mac and Windows.

## Lessons

- New: Vite outDir outside the project isn't emptied (`build-toolchain`);
  app presets force core tests off (`build-toolchain`); structured-binding
  lambda captures need Clang 16+ (`language-cpp`); build a realistic
  throwaway artifact before planning around estimates
  (`debugging-method`).
- Extended: the MSVC literal-cap entry (`language-cpp`, now with the Windows result: segmenting confirmed, unsplit ~64 KB limit still untested) and the two serving
  paths entry (`web-testing`).
- Beads memory: `bd export` after `bd create`/`update`. The automatic
  export wrote only the first of five new beads.
- Change B, new in `build-toolchain`: a configure-time glob can't track a
  build step's output, so embed depends on the producer's stamp; files added
  to Aurora.app must precede the signing step and survive
  `bundle-licenses.sh`'s wipe. Not filed (under the 30-minute bar): the link
  checker treats any backticked `*.md` name as a link, including generated
  files; Homebrew's `node@22` was linked on PATH despite `brew info` saying
  keg-only.
