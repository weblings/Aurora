# `PipelineHost::shutdown()` is final

Id: lyr3-shutdown-final

`Aurora-lyr3`, 2026-11-25, branch `feat/Mac1.2.1Testing`. Found in
[[i6zx-http-stop-join]]: the web server still serves after the apps call
`shutdown()`, so a reload or resume could start output streaming again.

## Change

- `shutdown()` sets a closed flag, takes the change and pipeline locks, moves the
  pipeline and failure light out, bumps the build epoch and shuts both down
  outside the locks.
- Afterwards reload and resume return true without building; a failed effect,
  the failure light and failure records do nothing.
- A reload or resume that finishes late shuts its outputs down as final.
- One that throws late does too, through `PipelineBuildOverrides::hostClosed`:
  the partial pipeline is only reachable inside `Pipeline::build`, and
  `HueOutput` has no destructor that stops the bridge.
- `shutdown()` now waits for a `reloadInputs` or failure-light build in progress
  (both hold the change lock). Before, quit waited for the first only when the
  server joined its handlers.
- Pipelines are now destroyed inside `shutdown()`, not with the host. The apps
  are unchanged.

## Verification

- Core `ctest`: 539/539.
- Both new `Aurora-lyr3` tests fail on the old `Pipeline.cpp`.
- `PipelineHost` and `LightTest` matches, 20 repeat runs: no failure.

## Not verified

- A Hue bridge. App builds on any platform.

## Follow-up

`Aurora-83k6`: a pause that lands during a reload discards the late build as a
replacement, which does not tell the bridge to stop. Read from code. Open.

## Lessons

- A host's shutdown must refuse later builds, not just stop what is installed ([[lesson-architecture-process]])
