# B2f: audio frequency bands (Aurora-id8j.8)

Id: id8j8-b2f-audio-bands

Closed 2026-10-16. Seventh code child of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `audio.bands` node (`core/Runtime/src/Graph/AudioNodes.cpp`): `buffer` in, Float `bass`, `mid`,
  `treble` out. Params `bassMaxHz` (250) and `trebleMinHz` (4000), mid sits between. Absent when
  the buffer is empty, fails if `trebleMinHz < bassMaxHz`.
- `AudioBandAnalyzer` (`core/AudioProcessing`): 1024-sample Hann window, own radix-2 FFT (no aubio),
  sliding history so any buffer size works. Reads the existing buffer, no capture changes.
- Levels are band RMS, same units as `audio.features` rms (sine of amplitude A reads A/sqrt(2)).
  Holds 0 until the first full window arrives (about 23 ms at 44.1 kHz).
- `AudioFeatures` and the drift/bounce parity goldens are untouched.

## Verification

- `AudioNodesTests.cpp`: 100 Hz, 1 kHz and 8 kHz sines each land in their own band at the expected
  RMS (5% tolerance) with the others under 0.02, moved band edges, silence reads 0, partial window
  holds 0, empty buffer gives Absent. ctest 334/334 (MSVC Debug, `build-core-test-win`).

## Lessons

- None filed.

## Carried forward

- Levels are unsmoothed and unnormalized. Smooth and scale downstream (time/state and scalar math nodes) before driving visuals.
