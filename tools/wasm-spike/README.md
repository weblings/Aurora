# WASM spike (Aurora-51nv.4)

Throwaway proof that the real graph engine runs under Emscripten and matches
the native build. Outcome and decision live on Aurora-51nv.

## What it does

`main.cpp` runs `builtin.video` or `builtin.audio` over fixed inputs and prints
one JSON line per frame. The same source builds native (MSVC + vcpkg) and
`wasm32-emscripten`. `compare.py` diffs the two outputs.

- Video: 30 frames of 64x32 RGBA, Area rescale to 16 wide, smoothing 0.5, four quadrant zones.
- Audio: 240 ticks of 48 kHz mono PCM (click track), `fixedAnchorHue` 30, so `palette.randomAnchor` is never hit.
- `gen_fixtures.py` writes both inputs, so both builds read identical bytes.

## Steps

1. emsdk (tested with Emscripten 7.0.0) and ninja (`pip install ninja`).
2. OpenCV 4.12.0 for WASM: core and imgproc only, `-msimd128`, `CPU_BASELINE`/`CPU_DISPATCH` empty,
   `WITH_PTHREADS_PF=OFF`, `BUILD_LIST=core,imgproc`, static, installed to a prefix.
3. aubio source tarball (the vcpkg-pinned commit). CMake here compiles `src/**/*.c` minus `io/`, with its
   built-in FFT and the `HAVE_*` defines the vcpkg port uses.
4. `emcmake cmake` this directory with `-DAURORA_OPENCV_PREFIX`, `-DAURORA_AUBIO_SRC`, `-DAURORA_GLM_INCLUDE`,
   `-DAURORA_JSON_INCLUDE` and `-msimd128`. Run `node spike.js video|audio <fixtureDir>` (NODERAWFS reads the fixtures).
5. Native: configure this directory with the vcpkg toolchain and run `spike.exe` the same way.

## Result (2026-11-17, Windows, MSVC native vs Emscripten 7.0.0)

- Video: 360 of 360 channel values bit-identical.
- Audio: 1440 of 1440 channel values bit-identical (198 distinct colors, so the path is exercised).
- Payload: `spike.wasm` 1,897,886 bytes raw, 499,501 gzip -9. Node glue `spike.js` 20,620 gzip. Built at -O3, no size tuning, all node families linked.

## Findings for Aurora-51nv.5 (graph-only target)

- Source list that links with no Http, Network, store or route code: Contracts `Interpolation.cpp`,
  Processing `ImageProcessing.cpp`, the three AudioProcessing files, and from Runtime `Config.cpp`,
  `ControlDescriptorTables.cpp`, `FrameCompositor`, `AudioFrameCompositor`, `Smoother`, `BrightnessFloor`
  and `Graph/*.cpp`. `ControlDescriptors.cpp` is excluded because it includes `HttpServer.hpp`.
- `-fexceptions` is on (GraphLoader uses try/catch). Not measured without it.
- OpenCV's installed `OpenCVConfig.cmake` references 3rdparty libs of modules that were not built, so the
  spike links `libopencv_imgproc.a`, `libopencv_core.a` and `libzlib.a` directly.
- Bit-identical here relies on aubio's built-in FFT on both sides. Mac (Accelerate) and Linux (apt, may use
  FFTW) natives are expected to differ slightly, as the existing audio parity fixtures already allow for.
- Not covered: `palette.randomAnchor` (Aurora-kuee), browser (non-Node) glue, SIMD-off fallback, `-Oz`.
