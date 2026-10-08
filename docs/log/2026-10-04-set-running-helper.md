# Aurora-5ipy.18: shared setRunning helper (closed)

Id: set-running-helper

Closed 2026-10-04. Prerequisite for the tray Pause/Resume beads (5ipy.14, .15, .16).

## What changed

- `PipelineHost::setRunning(bool, registry, configRoot, error)`: the one pause/resume entry point. Idempotent; resume loads config from `configRoot`; false only when a resume build fails (host stays paused).
- `PUT /api/state` (`PipelineRoutes.cpp`) now just calls it; the inline resume logic is gone. Response shapes and statuses unchanged.
- `PipelineTests.cpp`: direct test (double pause, failed resume stays paused with the build error, double resume).

## Decision

- Member on `PipelineHost`, not a route-side free function: trays link Runtime but have no route to call.
- The helper blocks for seconds on resume (Hue DTLS, Linux portal dialog), so callers must run it off the UI/D-Bus thread. Documented in the header; enforcing that is each tray bead's job.

## Verification

- `[PipelineHost],[PipelineRoutes]` suites: 189 assertions in 27 cases pass, including the existing route tests (rebuilt with `.venv/bin/cmake`).

## Not verified

- App targets (mac/windows/linux) were not rebuilt; none call the helper yet.
- No live devstack run; route behavior covered by the loopback tests only.

## Lessons

- None new. "No cmake on PATH" was rediscovered again (the 2026-10-04 tooltips entry hit it too); the existing build-toolchain entry already says `.venv/bin/cmake` works, so `source .venv/bin/activate` first.
