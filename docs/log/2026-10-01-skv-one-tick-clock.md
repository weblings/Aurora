# Aurora-skv: explicit dt into both orchestrators, one tick clock

Id: skv-one-tick-clock

Closed `Aurora-skv` (node-prep, item 4 of [[node-graph-pipeline]]'s prep
work). No-regression refactor toward the graph's "one clock per graph, dt
in the eval context".

## Change

- `Orchestrator::update(float dt)`, matching `AudioOrchestrator`. Unused
  on the video path: `Smoother` stays per-tick for parity.
- New `core/Runtime/include/Aurora/Runtime/TickClock.hpp`:
  `DefaultTickRateHz = 60`, `tickIntervalSeconds(rateHz)` (0 → default).
  Replaces the three `1.0 / 60.0` literals and the `1.0 / refreshRate()`
  in each of `app/{mac,linux,windows}/src/main.cpp`.
- Each app's `Pipeline::tick(float dt)` dispatches `dt` to whichever
  orchestrator runs; `PipelineHost::tick()` reads the interval and ticks
  under the same lock, so a pipeline swap can't mismatch them.
- Audio already received `dt` before this (the nominal 1/60s interval);
  the change there is only where the number comes from.

## Not changed (deliberately)

- dt is the nominal interval, not measured wall time between ticks.
- Audio mode still ticks at 60Hz, not the display rate (smaller buffers
  per tick would change aubio hop timing — a behaviour change).

## Verification

- Core: 89/89 (`build-core-test`), all 10 [[tft-parity-harness]]
  fixtures unchanged — no regenerate. New `TickClock` test.
- Mac app (`build/mac-app`): builds, 62/62; fake light viz stack streams
  live frames through the changed tick loop.
- Linux/Windows `main.cpp`: same edits, not compiled here (no CI);
  added to `Aurora-a97`.
- Lessons: "A scripted `#include` insertion after the last match can land
  inside an `#ifdef`" (`language-cpp`); "macOS has no `timeout` command"
  (`build-toolchain`).
