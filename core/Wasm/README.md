# core/Wasm

Emscripten build of `AuroraGraphEngine`, the graph engine target in
`core/Runtime` (see `core/Runtime/README.md`). Pulled in by `core/CMakeLists.txt`
only when `EMSCRIPTEN` is set, which also requires `AURORA_CORE_GRAPH_ONLY=ON`.
That option skips Network, Secrets, the httplib fetch, `AuroraRuntime` and the tests. On a
native compiler it builds only the engine, `parity/` and `GenServerSamples` (the CI reference).
Outcome of the spike that proved the engine matches native: [[51nv4-wasm-spike]].

- `versions.env`: the pins (emsdk, OpenCV tarball and SHA256, aubio commit and SHA256).
- `build-deps.sh`: builds the pinned OpenCV core and imgproc for WASM and natively, and unpacks aubio.
- `WasmDeps.cmake`: flags (`-msimd128 -fexceptions`) and the prebuilt OpenCV archives.
- `AubioFromSource.cmake`: `Aubio::aubio` compiled from source, used when `AURORA_AUBIO_FROM_SOURCE`
  is ON (the default under Emscripten, OFF natively). AudioProcessing's own lookup is then skipped.
- `CMakeLists.txt`: the Wasm targets. `graph_parity`, a Node-only driver, and `aurora_engine`,
  the browser module (`aurora-engine.mjs` and `.wasm`, an ES module for web, worker and node).
- `bindings/`: `BrowserEngine`, plain C++ with JSON strings in and out (live graph, preview
  sessions, a fed frame and audio block, zones from `init`), and `Exports.cpp`, the C exports.
  `BrowserEngine` also builds natively (`AuroraBrowserEngine`, with the tests) so
  `core/tools/GenServerSamples` can write the reference JSON the module is tested against.
  `loadLive` reloads the live graph in place once one exists, so node state carries over
  (`core/tests/BrowserEngineTests.cpp`).
- `parity/`: `main.cpp` runs `builtin.video` or `builtin.audio` over fixed inputs and
  prints one JSON line per frame. `gen_fixtures.py` writes those inputs. `compare.py`
  diffs a native and a WASM output.

## Build locally

1. emsdk at the version in `versions.env`, activated in the shell, and ninja (`pip install ninja`).
2. Dependencies, into any prefix (needs curl and network, checks the SHA256s):

```
core/Wasm/build-deps.sh <deps> all   # or wasm, native, aubio
```

   This writes `<deps>/opencv-wasm`, `<deps>/opencv-native` and `<deps>/aubio-src`. A prefix
   that already holds an OpenCV install skips it.
3. The module:

```
emcmake cmake -S core -B <build> -G Ninja -DCMAKE_BUILD_TYPE=Release   -DAURORA_CORE_GRAPH_ONLY=ON   -DAURORA_OPENCV_PREFIX=<deps>/opencv-wasm -DAURORA_AUBIO_SRC=<deps>/aubio-src
cmake --build <build>
```

4. The native reference, a graph-only configure with the same sources (it builds `graph_parity`
   and `GenServerSamples`). Any OpenCV 4.12 works locally, for example vcpkg's via `OpenCV_DIR`:

```
cmake -S core -B <native> -G Ninja -DCMAKE_BUILD_TYPE=Release -DAURORA_CORE_GRAPH_ONLY=ON   -DAURORA_AUBIO_FROM_SOURCE=ON -DAURORA_AUBIO_SRC=<deps>/aubio-src   -DCMAKE_PREFIX_PATH=<deps>/opencv-native
cmake --build <native>
```

glm and nlohmann_json are fetched as in a native build. Offline, pass
`-DFETCHCONTENT_SOURCE_DIR_GLM=<dir>` and `-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=<dir>`.

## Parity check

```
python parity/gen_fixtures.py <fixtureDir>
for m in video audio audio-seeded; do
  <native>/Wasm/parity/graph_parity $m <fixtureDir> > native-$m.jsonl
  node <build>/Wasm/graph_parity.js $m <fixtureDir> > wasm-$m.jsonl
  python parity/compare.py native-$m.jsonl wasm-$m.jsonl --label $m
done
```

Pass Windows paths to Node as `C:/...`. `compare.py` passes when every channel differs by less
than 1/255 and exits 1 otherwise. It prints the bit-identical and 8-bit-difference counts, and
`--summary <file>` appends a markdown line (CI passes `$GITHUB_STEP_SUMMARY`). Video is 30 frames
of 64x32 RGBA (Area rescale to 16 wide, smoothing 0.5, four quadrant zones). Audio is 240 ticks
of 48 kHz mono PCM with `fixedAnchorHue` 30. `audio-seeded` leaves the hue unset and feeds the
beat node from a `palette.randomAnchor` with seed 7, so the seeded pick is covered.

## CI

`.github/workflows/wasm.yml` runs the steps above on Linux with the pins, caches emsdk and both
OpenCV installs, runs the three parity cases, `web/engine/engine.test.mjs` and
`GenServerSamples --check`, and uploads `aurora-engine-wasm` (module, `.wasm`,
`build-info.json`) with the gzip size in the job summary. It is also `workflow_call`.

## Browser module

`aurora_engine` is built by the same configure as above. JS reaches it through
`web/engine/engine.js` (see `web/engine/README.md`). The test needs the built module:

```
node web/engine/engine.test.mjs <build>/Wasm/aurora-engine.mjs [fixtureDir]
```

The samples it compares with live in `web/graph-editor/src/graph/server-samples`. Regenerate
or check them with the native `GenServerSamples --fixtures <dir> [--check]` (ctest runs
the check as `ServerSamples.check`).

## Notes

- Bit-identical audio relies on aubio's built-in FFT on both sides, which is why the parity
  reference builds aubio from the pinned source. Mac (Accelerate) and Linux (apt, may use FFTW)
  app builds are expected to differ slightly.
- OpenCV's installed `OpenCVConfig.cmake` references 3rdparty libs of modules that were
  not built, so the archives are linked directly.
- Not covered: browser (non-Node) glue, SIMD-off fallback, `-Oz`.
