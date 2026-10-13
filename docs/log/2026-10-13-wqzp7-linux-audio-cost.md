# Aurora-wqzp.7 (Linux half): where Linux audio-only CPU goes

Id: wqzp7-linux-audio-cost

2026-10-13. Box: i5-1334U (12 logical), Linux 7.0, GNOME Wayland, PipeWire, ~59.5 Hz tick. `build/linux-app` rebuilt at `RelWithDebInfo` (the preset, Aurora-wqzp.15). `tools/perf-harness`, audio, 25 s windows, 440 Hz tone. Per-thread CPU from `/proc/<pid>/task/*/stat`, 15 s mid-run.

## Result

| content | CPU | audio update avg/max ms |
|---|---|---|
| static | 2.5% (2 runs) | 0.25 / 1.3 |
| moving | 2.4% | 0.37 / 5.0 |

Same box, same session, unoptimized build (no `CMAKE_BUILD_TYPE`, `build/linux-app-noopt`, 2 runs): 3.7%, 3.7%; update 0.43 ms.

The 6.2% / 0.94 ms X11 row (docs/log/2026-10-12-wqzp1-x11-perf-verify.md) is a different, older box (i5-7600K), so it is not comparable.

| thread | share of one core |
|---|---|
| tick thread (main) | 1.67% |
| unnamed `Aurora` worker (tid 2nd-highest, not identified) | 0.47% |
| `pw-data-loop` (PipeWire capture callback) | 0.20% |
| other | 0.07% |

- **Build type is about a third:** 3.7% -> 2.5%, update 0.43 -> 0.25 ms on the same box. The rest of the old 6.2% was the older CPU.
- **The PipeWire callback is not the cost.** 0.20% of a core. Quantum tuning has no payoff.
- **Tick-thread update holds the rest.** 0.25 ms x 59.5 Hz = 1.5%, matching the 1.67%
  main-thread share. Same aubio + downmix cost as Mac.
- **No code change made.** The only lever left is the one-FFT-per-hop idea in
  [[wqzp7-mac-audio-cost]], well under a point.
- Not chased: what the 0.47% worker thread is (likely Hue send or HTTP).
