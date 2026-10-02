# Aurora-9ig: Pipeline, PipelineHost and Registry moved into core (paused on CI)

Id: 9ig-pipeline-to-core

Node prep 6 ([[node-graph-pipeline]]). The three apps' `main.cpp` each
carried a copy of Pipeline/PipelineHost (~250 lines each), so node prep 7-9
would each have landed three times. Paused: code done and verified on Mac
and Windows (local); Linux not compiled yet; no CI run yet.

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
- Windows x64 (local, MSVC 17, 2026-10-01): `windows-app` Release builds and
  links `Aurora.exe`; app ctest 68/68. Core configured as CI does
  (`-DVCPKG_MANIFEST_MODE=OFF`): 121/121 incl. all 17 `AuroraPipelineTests`.
  Live run of `Aurora.exe --console` with a temp `AURORA_CONFIG_DIR`:
  `logLine()` lines (`WebUI: opening`, `Aurora running`, `[timing]`) reach
  `aurora.log` through the sink in the old format; `/api/monitors` 200 empty;
  `/api/reload` 200; a settings PUT with `activeInputName` "nope" reports
  `reloadError` and `/api/reload` then answers 500 with the app still up.
  Not exercised: clean shutdown (process was killed, not Ctrl+C'd), so no
  "Stopping..." line seen.
- Linux: not compiled. Resume: push `feat/NodesPrep2`, open a draft PR,
  confirm `AuroraPipelineTests` runs in each platform's core step (windows.yml
  has a "Core tests (incl. Parity)" step; the app ctest alone does not
  contain them) and both app builds pass, then close 9ig.

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
- Windows, manifest-mode core build (`cmake -S core` with the vcpkg toolchain
  and `core/vcpkg.json` active): "Monitors and reload routes answer from
  PipelineHost" segfaults on its first HTTP request, with any handler.
  Cause: the test target's include path lists `vcpkg_installed/.../include`
  (httplib 0.58.0, installed by the manifest) before the fetched httplib
  0.46.0 that `AuroraNetwork` compiles against, so the test TU and
  `HttpServer` disagree on httplib's struct layout (ODR). Not a 9ig bug:
  CI configures core with manifest mode OFF and passes. `AuroraNetworkTests`
  escaped it only because its include order differs. Fixed in Aurora-rtwh by
  dropping `cpp-httplib` from `core/vcpkg.json` (core fetches its own
  httplib; cpp-httplib's version file rejects a newer minor, so the installed
  0.58 was never accepted); a fresh manifest-mode core build has one httplib
  copy and passes 121/121. After the change, core with manifest OFF (121/121) and `windows-app`
  (68/68, `Aurora.exe` links) were rebuilt and still pass; Linux/Mac not run
  (no manifest there). Lessons: `build-toolchain` (two header copies), `debugging-method` (crash without a debugger).

