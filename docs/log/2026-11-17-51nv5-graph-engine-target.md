# Graph engine split out of AuroraRuntime as AuroraGraphEngine

Id: 51nv5-graph-engine-target

`Aurora-51nv.5` (A3). The graph engine is now its own static target, `AuroraGraphEngine`, defined in `core/Runtime/CMakeLists.txt` with sources and headers left in place. It holds `Graph/*`, `Config`, `ControlDescriptors` and its tables, the frame and audio compositors, `Smoother`, `BrightnessFloor`, the audio nodes and `AURORA_RUNTIME_AUDIO_AVAILABLE`. It also holds three new transport-free pieces:

- `GraphValidation`: `validateGraphDoc(nodes, outputNames, doc)`.
- `NodeCatalog`: the `/api/nodes` payload.
- `PreviewEvaluator`: the lock-free preview core, plus `previewSnapshotJson`.

`GraphPreview`, the 4-argument `validateGraphDoc` wrapper, `GraphRoutes` and a new `DescriptorRoutes.cpp` stay in `AuroraRuntime` as thin layers, so no caller changed. `AuroraRuntime` links the engine.

`AURORA_CORE_GRAPH_ONLY` skips Network, Secrets, the httplib fetch, `AuroraRuntime` and the tests. Emscripten requires the option. `core/Wasm/` holds the Emscripten glue:

- `WasmDeps.cmake`: prebuilt OpenCV archives, aubio from source, and `-msimd128 -fexceptions`.
- The `graph_parity` driver.
- `parity/`: the spike's `main.cpp`, `gen_fixtures.py` and `compare.py`.

`tools/wasm-spike` is deleted. Background: [[51nv4-wasm-spike]].

## Verification
- Windows: the core-tests build and full ctest pass (511 tests). #63, the known `Aurora-ruig` flake under `-j 8`, passes when run alone. windows-app builds.
- Fresh emcmake build of `core/Wasm` from an empty directory takes about 18 s. `graph_parity` matches the spike's native output bit for bit (video 360/360, audio 1440/1440). Payload: 1,897,873 bytes raw, about 502 KB gzip -9.
- Engine sources grepped for HTTP, filesystem and thread use. The only hit is the `HttpServer` forward declaration for `registerDescriptorRoutes` in `ControlDescriptors.hpp`, a declaration only.
- Open: Mac and Linux CI (the bead stays open until it passes). No native build target for the parity driver yet. `Aurora-51nv.7` needs one.
- 2026-11-18: Mac and Linux CI pass on PR 69. Closed.

## Lessons
- none
