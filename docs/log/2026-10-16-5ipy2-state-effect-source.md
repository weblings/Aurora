# Aurora-5ipy.2: GET /api/state adds effect and source

Id: 5ipy2-state-effect-source

Builds on [[kea-capability-flags]]. Core verified under WSL; the Linux app hook
was not compiled.

## Built

- `effect`: active graph id (`builtin.video`, `builtin.audio`), null when idle
  or failed. No `mode` field, per the NodeGraphPipeline decision. Dual capture
  reports `builtin.video`.
- `source`: `{video, audio}`, null for an unused side. Video is `{input,
  monitor}` (monitor null when none selected), audio is `{input, sink, auto}`.
- `Pipeline` builds a `PipelineSummary` once. `PipelineHost` stores it under its
  own leaf lock beside the capability bits (constructor, reload swap, resume)
  and keeps it through pause. A monitor change is a Reload, so the build-time
  snapshot cannot go stale.
- `IVideoInput::selectedMonitorName()`.
- `PipelineOptions::describeAudioSink` (Linux: `AudioGrabber::sinkStatus()`).
  Asked only while running with an audio side, via `withAudioInput`, so that
  case takes the pipeline lock for one tick. Paused or no hook: the configured
  target, with `auto` true when it is empty.

## Verification

- New core test covers video, audio, pinned sink, paused and idle. The idle
  exact-match test was updated. `AuroraPipelineTests` all pass.
- Full `ctest -j8` once failed the Aurora-3ddb pause/resume PUT test, which
  passed alone: unexplained, probably parallel-run timing.
- Fake video input cannot select a monitor, so `monitor` is only asserted null.

## Not done

- Brightness moved to Aurora-5ipy.7. No separate health field: errors and
  conditions carry it.
- Lessons: none.
