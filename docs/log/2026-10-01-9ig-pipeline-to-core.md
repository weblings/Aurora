# Aurora-9ig: Pipeline, PipelineHost and Registry moved into core

Id: 9ig-pipeline-to-core

Node prep 6 ([[node-graph-pipeline]]). The three apps' `main.cpp` each
carried a copy of Pipeline/PipelineHost (~250 lines each), so node prep 7-9
would each have landed three times. Closed after CI on the draft PR
(`feat/NodesPrep2` -> `dev`) passed on all three platforms.

## What moved

- `Registry` (byte-identical in all three apps, interfaces only) into
  `core/Runtime` as `Aurora::Runtime::Registry`; its tests into
  `AuroraRuntimeTests`.
- `Pipeline`, `PipelineHost`, `reloadPipelineFromDisk` (`Pipeline.hpp`) and
  `registerMonitorsRoute`/`registerReloadRoute` (`PipelineRoutes.hpp`). The
  settings-save, Hue-pairing and `/api/reload` callbacks now share one
  reload path, which Aurora-c0g changes next.
- Per-app differences are `PipelineOptions`: leveled `log` (Windows routes
  to `logLine`; Linux/Mac keep the stdout/stderr split), `noAudioSupportMessage`,
  `describeBuildError` (Mac's `PermissionError` -> `permission_denied: `/
  `permission_pending: `). Linux sink status and Mac audio-permission state
  go through `PipelineHost::withAudioInput`.
- Each `main.cpp` lost 420-460 lines; the tick loop stays per app (Mac runs
  it on a worker thread, Aurora-zlw).

## Verification

- Mac arm64: core 120/120 (17 new in `AuroraPipelineTests`: build modes,
  output selection, zones, reload swap/failure/describeBuildError,
  reload-from-disk, both routes over a real HttpServer); core with
  `AURORA_CORE_ENABLE_AUDIO=OFF` 84/84; `mac-app` 57/57 (62 before, 5
  Registry tests moved to core).
- Live, fake-Hue devstack on Mac: frames flow; `/api/monitors`;
  `/api/reload` 200 and 500 (`Unknown input 'nope'`); a bad settings PUT
  reports `reloadError` and keeps the old pipeline; `/api/zones`,
  `/api/mac/audio-status`; `[timing]` lines in the same order; clean stop.
- CI (draft PR, after merging `dev`, which added a network test and an
  Origin/Host write gate): Linux, Windows and Mac all green. Each core step
  reported 121/121 with the 17 `Pipeline` cases listed, including the
  audio-mode case (audio built everywhere) and the routes case under the
  new write gate; the Linux and Windows app builds compiled the edited
  `main.cpp` files, which were never compiled locally.

## Findings

- The per-app default video input name was unreachable (empty name with
  no audio returns early; empty name with audio is audio mode). Dropped.
  Lesson: "Before turning a per-copy difference into a hook, check the
  copy can actually reach it" (`architecture-process`).
- Windows included and used `AudioOrchestrator` with no audio guard, so a
  build with core audio off failed to link. Core's guards fix it.
- `Registry::outputNames()` is unordered, so "first output" (zone routes)
  is hash order with nothing selected. Aurora-9sm; lesson in
  `architecture-process`.
- Aurora-4g2 closed: already fixed, and the code now lives once in core.
- Beads DB and export drifted both ways (DB newer for 9ig, file newer for
  daa and 21h's close); fixed with single-record imports. Added to the
  "stale live DB" lesson.
- Test fakes were written fresh in `PipelineTests.cpp`, not lifted from
  the orchestrator tests: Pipeline needs Registry-owned fakes that report
  into shared state.
