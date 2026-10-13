# Aurora-wqzp.7 / .15: where Mac audio-only CPU goes, and optimized presets

Id: wqzp7-mac-audio-cost

2026-10-13. Box: Apple M5 (10 logical), macOS 27.0.1, ~51 Hz tick. `tools/perf-harness`, audio / static, 25 s windows, 440 Hz tone; `sample` 10 s mid-run.

## Result

| Build | CPU | audio update avg/max ms |
|---|---|---|
| `build/mac-app` (preset, no `CMAKE_BUILD_TYPE`) | 3.5% | 0.68 / 15.69 |
| same tree, `-DCMAKE_BUILD_TYPE=Release` | 1.6%, 1.8% (2 runs) | 0.30-0.31 |
| Release + ingest-loop change (reverted) | 1.9% | 0.34 |

- **Half the "4%" is the build type.** The `mac-app` and `linux-app` presets set no
  `CMAKE_BUILD_TYPE`, so they build without `-O`. Windows is measured `--config Release`.
  The Mac 1.0.4 release build dir (`build/mac-release`) has no build type either.
  Filed Aurora-wqzp.15 (P1).
- **The capture callback is not the cost.** `MacAudioGrabber::ioProc` (the
  `com.apple.audio.IOThread.client` thread) shows 3 non-idle samples in 6,100.
  Update avg × tick rate (0.30 ms × 51 Hz ≈ 1.5%) accounts for nearly all of the process CPU.
  The bead's premise (callbacks and analysis threads) does not hold on Mac.
- **Inside update (Release):** about 155 of 179 tick-thread samples are in
  `AudioOrchestrator::update`. aubio (two FFT pipelines per 512-sample hop, vDSP)
  plus the mono downmix and `extractFeatures` make up most of it; Hue `sendto` is a handful.
  Volume is normal: 1,835-1,913 samples per tick, 48 kHz stereo.
- **Cheap change tried, no win:** bulk-copy into aubio's hop vector (no per-sample
  `fvec_set_sample` dylib call), size the ring buffer once instead of `push_back`
  per frame, and erase consumed hops once per call. The downmix self-samples went
  82 -> 17, but `aubio_onset_do` rose 25 -> 84 and the total stayed flat. The cost
  follows whatever runs first after each ~20 ms wake (cold caches, probably a
  low-clocked core), so the change was reverted. Core tests 183/183 passed with it (serial).
- Remaining Mac gap vs Windows (0.30 vs 0.14 ms) is not chased. The follow-up run
  below measured 0.07-0.15 ms, so most of that gap was run-to-run spread.

## Open

- Linux not measured (`needs-linux`). The Linux X11 row (6.2%, update 0.94 ms,
  docs/log/2026-10-12-wqzp1-x11-perf-verify.md) is also an unoptimized build, and
  0.94 ms × 59.7 Hz ≈ 5.6% puts most of it in update, not the PipeWire callback.
  Re-measure at Release before profiling the PipeWire quantum.
- Halving aubio's work by deriving the centroid from the onset's spectrum (one
  FFT per hop instead of two) is the only code lever left, worth well under a point.
- `ctest -j 8` on core flakes 1-2 HTTP route tests (Aurora-3ddb / Aurora-d6i7
  tests) with or without this change; they pass serially.

## Follow-up: Aurora-wqzp.15 (presets set `RelWithDebInfo`)

`linux-app` and `mac-app` now set `CMAKE_BUILD_TYPE=RelWithDebInfo`. Nothing in
the tree uses `assert()`, and the only `NDEBUG` check is in `app/windows`, so the
`NDEBUG` this implies removes no checks. `perf.py` reports the app's build type
(`hardware:` line, JSON `hardware.build_type`) and warns up front on an unoptimized
build. Mac app tests 84/84 at `RelWithDebInfo`. Linux preset not built locally.

Full Mac re-measure, same box, 20 s windows, one run:

| mode | content | CPU | update avg/max ms (video; audio) |
|---|---|---|---|
| video | static | 2.2% | 0.13 / 1.76 |
| audio | static | 1.9% | 0.15 / 1.44 |
| both | static | 2.8% | 0.13 / 1.75; 0.13 / 0.23 |
| video | moving | 1.3% | 0.18 / 4.56 |
| audio | moving | 0.9% | 0.07 / 0.23 |
| both | moving | 1.6% | 0.25 / 4.99; 0.04 / 2.92 |

Unoptimized for comparison (docs/log/2026-10-12-wqzp3-mac-video-cpu.md): video
3.3% / 4.3%, both 5.8% / 6.5%, audio 4.0%. Mac audio update (0.07-0.15 ms) now
matches Windows (0.14 ms). The earlier Release run's 0.30 ms was not reproduced, so
run-to-run spread is wide. Moving rows coming in under static is unexplained (single run).
