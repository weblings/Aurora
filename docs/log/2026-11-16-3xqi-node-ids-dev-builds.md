# Graph editor: node ids only in developer builds

Id: 3xqi-node-ids-dev-builds

`Aurora-3xqi`, stage 9 of [[graph-editor-cleanup]]. Node ids no longer show in node headers. They are a developer aid, because the problems list already names and selects the node.

## What changed

- `GET /api/version` gains `buildType`, the CMake config name (`$<CONFIG>`, set on `HostRoutes.cpp` only). `/api/v1/version` is untouched, so the frozen contract is unchanged ([[api-v1-review]]). The WebUI stays on the internal routes ([[api-v1-plan]]).
- The editor hides ids when `buildType` is `Release` or `MinSizeRel`, or when the lookup fails. In Debug and RelWithDebInfo the node label tooltip adds `Title (id)` and Details shows the id as its subtitle.
- The "unversioned `/api/*` routes are internal" note already existed in `docs/api/README.md`, so none was added.

## Verification

- Editor `tsc --noEmit` clean, vitest 253/253.
- Core Debug test build, `AuroraRuntimeTests` 199 cases pass. The version test checks `buildType` is a non-empty string, not that it equals `Debug`.
- Browser checks and a running app were not used, so the tooltip and Details wording were not seen live.

## Lessons

- none
