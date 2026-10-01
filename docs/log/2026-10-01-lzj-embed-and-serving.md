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
- Not yet run: Windows (MSVC) and Mac (Apple Clang). App presets force
  core tests off, so use a standalone `cmake -S core -B build/core-tests`
  and `ctest -R "embed_webroot|HttpServer"`.

## Resume

Run the Windows and Mac core-test checks, then change B (lzj design
steps 3-7).

## Lessons

- New: Vite outDir outside the project isn't emptied (`build-toolchain`);
  app presets force core tests off (`build-toolchain`); structured-binding
  lambda captures need Clang 16+ (`language-cpp`); build a realistic
  throwaway artifact before planning around estimates
  (`debugging-method`).
- Extended: the MSVC literal-cap entry (`language-cpp`) and the two serving
  paths entry (`web-testing`).
- Beads memory: `bd export` after `bd create`/`update`. The automatic
  export wrote only the first of five new beads.
