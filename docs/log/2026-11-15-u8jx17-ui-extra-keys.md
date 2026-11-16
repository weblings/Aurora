# Graph doc ui entries keep extra keys through draft PUT, GET and save

Id: u8jx17-ui-extra-keys

`Aurora-u8jx.17` (epic `Aurora-u8jx`). Pins the graph format before the 1.2.0 API freeze so per-node previews (`Aurora-z9vu`) can save a flag in `ui` without a format change.

## What changed

- Core test only: `PipelineTests.cpp` "Graph ui entries keep extra keys through draft PUT, GET and save on core and v1 routes (Aurora-u8jx.17)". It PUTs a draft whose `ui` entry is `{"x": 40, "y": 80, "preview": true, "note": "hi"}` on `/api/graph/drafts/:session` and `/api/v1/graph/drafts/:session`, reads it back, saves it, reads the saved effect, and checks the entry is unchanged and validation reports no errors.
- The test passed on the first run, so no route or loader change was needed.
- `docs/api/README.md`: one line stating that `ui` is opaque to the API. `openapi.yaml` did not need an edit.

## Verification

- `build/core-tests` configured with `-DVCPKG_MANIFEST_MODE=OFF` (see the build-toolchain lesson), built in 3m02s, new test 1/1.
- Full suite `ctest -j8`: 502/503. `A second session's test names its holder and reports the takeover (Aurora-0tqq)` failed once under load and passed alone and in a second filtered run.

## Lessons

- none
