# Aurora-9ig: Pipeline, PipelineHost and Registry moved into core

Id: 9ig-pipeline-to-core

Node prep 6 ([[node-graph-pipeline]]). The three apps' `main.cpp` each
carried a copy of Pipeline/PipelineHost (~250 lines each), so node prep 7-9
would each have landed three times. Verified locally on Mac, Windows and
Linux (manual builds, ctest, live fake-Hue checks); closed after CI on the
draft PR (`feat/NodesPrep2` -> `dev`) also passed on all three platforms.

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
- Linux x64 (local, GCC 13.3, 2026-10-01): configured/built exactly as
  `linux.yml` does. `cmake --preset linux-app -DAURORA_ENABLE_GRAPH_EDITOR=ON`
  + `cmake --build build/linux-app`: `aurora-app-linux` links against core
  `AuroraRuntime`; `ctest --test-dir build/linux-app` 85/85. Core standalone
  (`cmake -S core -B build/core-test`, manifest mode never applies on
  Linux): 121/121, including all 17 `AuroraPipelineTests` cases (the
  "Monitors and reload routes answer from PipelineHost" case that hit the
  httplib ODR segfault under Windows manifest mode passes cleanly here).
  Core with `AURORA_CORE_ENABLE_AUDIO=OFF`: builds and links with no
  Windows-style unguarded-audio failure, 85/85. Live, `--fake-hue --console`
  with a temp `AURORA_CONFIG_DIR`: `/api/monitors`, `/api/zones`,
  `/api/linux/audio-sinks` all answer; `/api/reload` 200 on a good config,
  500 (`Unknown input 'nope'`) on a bad one with the app staying up and the
  old pipeline still serving `/api/monitors`; `[timing]` lines in the same
  order as Mac/Windows; `Stopping...` and a clean exit on SIGINT (the one
  case Windows's run skipped).
- CI (draft PR, after merging `dev`, which added a network test and an
  Origin/Host write gate): Linux, Windows and Mac all green. Each core step
  reported 121/121 with the 17 `Pipeline` cases listed, including the
  audio-mode case (audio built everywhere) and the routes case under the
  new write gate; the Linux and Windows app builds compiled the edited
  `main.cpp` files, which were never compiled locally. This CI run is what
  actually closed 9ig; the local Windows/Linux runs above ran on an earlier
  commit, before this `dev` merge, and caught Aurora-rtwh (manifest-mode
  only, so invisible to CI either way) that the PR run alone wouldn't have.

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
- Core with `AURORA_CORE_ENABLE_AUDIO=OFF` is 85/85 on Linux vs 84/84 on
  Mac: expected (different platform-specific test sets, e.g. no
  `embed_webroot.py` fixture test on Mac's run), not a regression -- the
  count alone isn't the oracle, same principle as the existing
  "check the test count and names, not the pass line" lesson
  (`build-toolchain`).
- No new lesson filed for the Linux run itself: the one tooling fact it
  depends on (this box has no system `cmake`/`ctest`, only the `.venv`
  pip-installed one) was already covered by two existing
  `build-toolchain` entries ("Without cmake, flags.make + link.txt..." and
  the huenicorn-fork Mbed TLS entry); nothing new to add.

