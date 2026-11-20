# Browser interface for the WASM graph engine

Id: 51nv6-browser-engine

`Aurora-51nv.6` (A4). `core/Wasm/bindings` holds `BrowserEngine`, a C++ class where every call takes and returns JSON text. It runs one live graph and any number of preview sessions, all on `PreviewEvaluator`, over one fed RGBA frame and audio block. It serves the zones given at `init` and `setZones`. `Exports.cpp` wraps it in C exports (`aurora_*`, no embind) for the `aurora-engine.mjs` ES module. A C++ exception becomes `{"error"}` instead of aborting the module. Background: [[51nv5-graph-engine-target]].

- `ZoneMapJson` in the engine is now the one zone-map parser. `ZoneMapStore` keeps the file I/O. `_uvsFromJson` in `ZoneRoutes.cpp` stays, since it reads a request body and returns an optional.
- `web/engine/engine.js` is a synchronous wrapper with no Worker code. The Worker lands in `Aurora-51nv.10`. `engine.test.mjs` drives every export and compares against `web/graph-editor/src/graph/server-samples`.
- `core/tools/GenServerSamples` (native, built with the tests) writes those samples from `BrowserEngine`, with hand-written inputs under `server-samples/inputs/`. Its `--check` runs in ctest as `ServerSamples.check`. Preview colors there may differ by under 1/255, so Mac and Linux builds pass. Every other file must match exactly.
- `nodes.json` and the built-in graph samples already matched the catalog. They were rewritten only for a trailing newline.
- The live graph has no `gamma` and `tickMs` is 0 in the browser, so samples are deterministic.

## Verification
- Windows: the core-tests build and ctest pass, 513 tests including the 2 new `ServerSamples` ones. windows-app builds.
- Fresh emcmake build, about 20 s. `node web/engine/engine.test.mjs <module> <fixtures>` passes 13/13. The native (MSVC) and WASM preview colors match exactly.
- graph-editor vitest: 295 tests pass.
- The `--check` tolerance was checked by hand: a 0.001 color change passes and a 0.01 change fails.
- Payload: `aurora-engine.wasm` is 2,026,634 bytes raw and 536,359 gzip -9. The glue is 5.5 KB gzip.
- Open: CI wiring and the Mac and Linux builds are `Aurora-51nv.7`.
- 2026-11-18: `wasm.yml` runs the engine test and sample check green on PR 69. Closed.

## Lessons
- none
