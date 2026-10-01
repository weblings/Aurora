# Aurora-tft: golden parity harness for both orchestrators

Id: tft-parity-harness

Closed `Aurora-tft` (node-prep, item 3 of [[node-graph-pipeline]]'s prep
work). Pins today's video and audio output so the node-graph runtime, and
refactors like node prep 4, can prove no regression.

## What exists

- `core/tests/GoldenFrames.hpp`: `RecordingOutput` (every Frame, stamped
  with tick), an LCG, fixture write/check. Channel tolerance 1/255; one
  frame per line so regenerated fixtures diff readably.
- `VideoParityTests.cpp` (`AuroraVideoParityTests`): static quadrants;
  black→white step with smoothing 0.8 and zone gamma; BGRA gradient, Area
  64→16, two outputs sharing zone ids, inactive + overlapping zones;
  letterbox bars.
- `AudioParityTests.cpp` (`AuroraAudioParityTests`, audio builds only):
  PCM click track and silence→bursts through `AudioOrchestrator` (incl.
  aubio); scripted `AudioFeatures` into `updateDrift`/`updateBounce` at
  60Hz and 144Hz, silence, and every setting off-default. All pin
  `fixedAnchorHue`.
- Fixtures: `core/tests/golden/*.json`, 10 files, ~180KB. Regenerate:
  `AURORA_UPDATE_GOLDEN=1 ctest --test-dir <build> -R Parity`.

## Verification

- Mac arm64, `build-core-test`: 88/88. A hand-tampered fixture value
  fails with an expected/got diff.
- Linux/Windows not run (no CI in this project): `Aurora-a97` runs them
  by hand against the same Mac-generated fixtures -- one baseline, not one
  per platform. PCM scenarios are the risk (aubio FFT backend differs by
  platform).

## Findings

- `Aurora-7r3`: drift never reaches the output. `updateBounce` reads the
  drift anchor only on init, so `audio_features_silence_drift` is one
  color for 600 ticks. Fixtures pin the current behaviour; fixing 7r3
  means a deliberate regenerate.
- Lesson: "Golden color fixtures must be designed for cross-platform
  float drift, not just recorded" (`processing`).
