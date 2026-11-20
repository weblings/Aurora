# Source-less custom graphs build with no capture input

Id: que2-input-free-build

`Aurora-que2`, apply half. Preview with no pipeline moved to `Aurora-wq6i`.

## State

- `GraphRunner` has a video-mode constructor with no capture input. Its `init`
  already skipped monitor and width work for a null input.
- `Pipeline::build`: a custom graph with no source nodes (`inputFree`) opens no
  input, skips the missing-input auto-pick, borrows none, and runs in video mode.
  A denied or missing configured input no longer fails it.
- Test: `A source-less graph builds and runs without opening any input`, where
  the video factory throws. Full ctest on Windows: 479 of 479.

## Open

- Preview still needs a pipeline: `PipelineHost::openPreview` refuses with no
  pipeline running. Needs the host-held input-free pipeline from `Aurora-dh1p`,
  tracked in `Aurora-wq6i`.
- A config with no inputs at all still returns null from `build` and reads Idle
  (`Aurora-zl32`).
- Recovery through the host (switch to a source-less effect after a failed
  startup) was not run end to end.
- The failing-first run of the new test was skipped to save a full build.

## Resume

`Aurora-zl32`, then `Aurora-dh1p`.

- Lessons: none.
