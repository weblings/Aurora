# core/Wasm

Emscripten build of `AuroraGraphEngine`, the graph engine target in
`core/Runtime` (see `core/Runtime/README.md`). Pulled in by `core/CMakeLists.txt`
only when `EMSCRIPTEN` is set, which also requires `AURORA_CORE_GRAPH_ONLY=ON`.
That option skips Network, Secrets, the httplib fetch, `AuroraRuntime` and the tests.
Outcome of the spike that proved the engine matches native: [[51nv4-wasm-spike]].

- `WasmDeps.cmake`: flags (`-msimd128 -fexceptions`), the prebuilt OpenCV archives
  and `Aubio::aubio` compiled from source. AudioProcessing's own aubio lookup is skipped.
- `CMakeLists.txt`: the Wasm targets. Today `graph_parity`, a Node-only driver.
- `parity/`: `main.cpp` runs `builtin.video` or `builtin.audio` over fixed inputs and
  prints one JSON line per frame. `gen_fixtures.py` writes those inputs. `compare.py`
  diffs a native and a WASM output.

## Build locally

1. emsdk (tested with Emscripten 7.0.0) and ninja (`pip install ninja`).
2. OpenCV 4.12.0 for WASM, core and imgproc only, static, installed to a prefix:
   `-DBUILD_LIST=core,imgproc -DBUILD_SHARED_LIBS=OFF -DCPU_BASELINE= -DCPU_DISPATCH=
   -DWITH_PTHREADS_PF=OFF -DWITH_IPP=OFF -DWITH_ITT=OFF -DWITH_OPENCL=OFF
   -DBUILD_TESTS=OFF -DBUILD_PERF_TESTS=OFF -DBUILD_EXAMPLES=OFF
   -DCMAKE_C_FLAGS=-msimd128 -DCMAKE_CXX_FLAGS=-msimd128`, then `cmake --install`.
3. aubio source tarball (the vcpkg-pinned commit), unpacked anywhere.
4. Configure and build:

```
emcmake cmake -S core -B <build> -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DAURORA_CORE_GRAPH_ONLY=ON \
  -DAURORA_OPENCV_PREFIX=<opencv install> -DAURORA_AUBIO_SRC=<aubio source>
cmake --build <build>
```

glm and nlohmann_json are fetched as in a native build. Offline, pass
`-DFETCHCONTENT_SOURCE_DIR_GLM=<dir>` and `-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=<dir>`.

## Parity check

```
python parity/gen_fixtures.py <fixtureDir>
node <build>/Wasm/graph_parity.js video <fixtureDir> > wasm-video.jsonl
node <build>/Wasm/graph_parity.js audio <fixtureDir> > wasm-audio.jsonl
python parity/compare.py native-video.jsonl wasm-video.jsonl
```

Pass Windows paths to Node as `C:/...`. The native side is `parity/main.cpp` built
against `AuroraGraphEngine` with the same fixtures. Video is 30 frames of 64x32 RGBA
(Area rescale to 16 wide, smoothing 0.5, four quadrant zones). Audio is 240 ticks of
48 kHz mono PCM with `fixedAnchorHue` 30, so `palette.randomAnchor` is never hit.

## Notes

- Bit-identical audio relies on aubio's built-in FFT on both sides. Mac (Accelerate) and
  Linux (apt, may use FFTW) natives are expected to differ slightly.
- OpenCV's installed `OpenCVConfig.cmake` references 3rdparty libs of modules that were
  not built, so the archives are linked directly.
- Not covered: browser (non-Node) glue, SIMD-off fallback, `-Oz`.
