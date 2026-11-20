# Pipeline capabilities follow the running graph's nodes

Id: ajr5-graph-capabilities

`Aurora-ajr5` (P3). A running custom effect with no source reported `usesVideoInput` and `samplesZones` true, because `Pipeline::capabilities()` derived them from `!m_isAudioMode`, so the Dashboard showed Zone Mapping for an effect that samples nothing.

## What changed

- `core/Runtime/src/Pipeline.cpp`: `capabilities()` walks the running graph (`graphJson()`: the custom document, else the built-in for the mode): `video.capture` sets `usesVideoInput`, `audio.capture` `usesAudioInput`, `zones.sample` `samplesZones`. No runner, all false. `PipelineHost::_storeCapabilities` already caches the result at every swap, resume and install, so `/api/state` still reads cached bits.
- The `AURORA_DEV_DUAL_CAPTURE` spike (`m_isDualCapture && !m_bothInputs`) runs the built-in audio graph beside the video one `graphJson()` returns, so it keeps `usesAudioInput` true (added by the coordinator on review).
- `core/tests/PipelineTests.cpp`: a source-less custom graph reports all three false, on the pipeline and on the host's cached bits. The existing built-in video, audio and both-inputs capability tests pass unchanged.
- No JSON shape change, no OpenAPI change; nothing in app/ reads these fields.

## Verification

- `build/core-tests` full `ctest -j8`: 498 of 499; the one failure was Aurora-yqu8's flaky settings test (its failure output was captured on that bead).
- `node --test` over web/ui tests: 29 pass, 0 fail.
- After rebuilding `build/mac-app`: dashboard-shell 38 s, effect-panel, graph-editor 27 s, graph-editor:gate 16 s, graph-editor:zones, all pass.

## Lessons

- none
