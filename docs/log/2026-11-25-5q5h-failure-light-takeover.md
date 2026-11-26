# The failure light opens its own stream when the failed build took the area over

Id: 5q5h-failure-light-takeover

`Aurora-5q5h`, 2026-11-25, branch `feat/Mac1.2.1Testing`. Reproduced on a real
bridge in [[121-mac-release-retest]].

## Cause

`HueOutput::init()` stops and restarts the entertainment area. A build that then
failed stopped the area as final, and the failure light borrowed the running
pipeline's outputs, whose stream had ended. A light already on was also kept
through a failed retry. The restart alone ends the older stream (inferred from
code), so failures without the final stop were affected too.

## Change

- `Pipeline::openedOutputs()` says whether a build began its own output init.
- After such a failure the host builds the light on fresh outputs, replacing any
  light already on. The older outputs shut down as replacements.
- If that light cannot build, the stale one is dropped, so a later retry builds one.
- A failure before output init (unreadable effect) still borrows the outputs.

## Verification

- Core `ctest`: 544/544.
- Both new `Aurora-5q5h` tests fail on the old `Core/Runtime`.
- The `5q5h`, `83k6`, `lyr3` and `dh1p` tests, 20 repeat runs: no failure.

## Not verified

- A Hue bridge. App builds on any platform.

## Follow-up

`Aurora-d5n4`: a failed device change keeps a pipeline whose stream the failed build
may have ended. Read from code. Open.

## Lessons

- Initializing a second output instance ends the first one's session ([[lesson-architecture-process]])
