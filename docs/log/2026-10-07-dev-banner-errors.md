# Aurora-7ybx: dev banner-error injection tooling (closed)

Id: 7ybx-dev-banner-errors

2026-10-07. Owner wanted to explore the system-error banner visuals (1 row,
collapsed 2-row) and asked whether existing tooling could produce that
state. Nothing could: `devstack.py` always leaves a healthy stack, and 2
simultaneous rows were unreachable on Linux through any public API (build
errors overwrite each other in `_setBuildErrorLocked`; the only coexisting
source, `audio_permission`, is wired up Mac-side only).

## Done

- `registerDevErrorsRoute` in core `Runtime` (`PipelineRoutes.hpp/.cpp`):
  `POST /api/dev/errors {source, message}` injects a generic error through
  `PipelineHost::setError` (200; 409 `not_running` with no pipeline/paused;
  400 on bad/empty body), `POST /api/dev/errors/remove {source}` removes it
  through `removeError`. POST-shaped removals follow the existing dismiss
  route, not DELETE. Only registered when `AURORA_DEV_ERRORS` is set
  (presence-only, same convention as `AURORA_DEV_LIGHT_TAP`); otherwise the
  paths 404.
- Registered from all three app mains next to `registerStateRoute`, so the
  tooling is cross-platform by construction.
- `devstack.py up --banner-errors 0|1|2`: sets the env flag and injects
  that many `dev-N` errors once frames flow; host keeps running, so rows
  carry Retry + X. README section added.
- Committed core test: 404-gated without the flag, set x2 visible in
  `GET /api/state` as running + 2 errors, 400 on bad body, remove +
  repeat-remove, 409 on an idle host.
- Found while scoping: the X is per-host-state, not per-row
  (`hostState === 'running'` gates every row), so X vs no-X needs two
  sequential states, never one mixed banner. Unknown sources render bare
  (no `SOURCE_PREFIX`), Retry works for all of them.

## Verification

- New case green (31 assertions); `[PipelineRoutes]` 9/9 (157 assertions);
  full `AuroraPipelineTests` binary green (483 assertions, 59 cases).
- Diff is additions-only across 8 files (core routes + 3 mains + core test
  + devstack + README). Uncommitted for owner review (conservative profile).

## Open

- Live run: this session is WSL with no viewer, so `--banner-errors` was
  never eyeballed here -- needs the owner (or a Mac/Win box) to `up` it and
  look at the Dashboard. Linux-app rebuild was still compiling at close;
  it also validates the linux main's one-liner.
- No bead existed before the code was written (workflow miss); Aurora-7ybx
  was created retroactively and closed in the same pass. One lesson added
  to [[lesson-output]]'s failure-injection set (generic injection route).

