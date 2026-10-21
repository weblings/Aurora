# Aurora-4xqt.1: Windows second-duplication recheck

Id: 4xqt1-windows-second-duplication-recheck

Last owed item of [[4xqt1-input-rebuild-keeps-outputs]]. The preview path passes
on Windows, but only with a temporary DPI-awareness patch: unpatched, live Windows
capture streams nothing on this box (`Aurora-8u3p`).

## What is checked

- A preview of a graph that needs video, while the live pipeline is audio-only,
  opens its own video input: a new `IDXGIOutputDuplication` on the monitor
  (`openPreviewInputs`, `Pipeline.cpp`).
- Pass: preview streams zones with no errors, live stays `running` on the audio
  effect, the preview's duplication is released when it ends.

## Setup

- The existing `build-app-windows` Debug exe predated the D0a commits (built 12:47,
  preview-owned capture committed 12:48), so it was not used.
- Worktree `Aurora-d0a-wt` detached at `a684956` (`origin/feat/NodesExternal_D`),
  configured with the main tree's `FETCHCONTENT_BASE_DIR`, Debug built.
  `cmake --build ... -- /m` fails under Git Bash (path mangling), use `--parallel`.
- Gotcha: sharing `FETCHCONTENT_BASE_DIR` also shares the `_deps/*-build` dirs, so
  the worktree configure repointed the main tree's `AuroraInputWindows.vcxproj`
  at the worktree's sources. Rerunning `cmake -S app/windows -B build-app-windows`
  in the main tree restored it. A worktree needs its own `_deps`.
- An audio-live state with video still configured needs a custom audio-only graph:
  `activeEffectId=builtin.audio` alone stays on video while `activeInputName` is
  set (`_planMode` picks audio mode only from an empty video input or the graph).
  The built-in audio graph (`GET /api/effects/builtin.audio`) was applied as
  `recheck-audio` through a draft.

## Why live capture streamed nothing

- `devstack.py up --input windows` timed out on the first SSE frame 5 times with
  the D0a exe, and once with the older main-tree Release exe. State read `running`
  with no errors and `app.log` stayed empty. `--input dummy` worked.
- Temporary HRESULT logging to `%TEMP%\aurora-dxgi-debug.log` showed
  `D3D11CreateDevice` succeeding and `DuplicateOutput1` returning `0x887A0004`
  (`DXGI_ERROR_UNSUPPORTED`) on every retry, about every 230 ms.
  `_ensureDuplication` drops the failure and retries, so it never surfaces.
- `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)`
  before `DuplicateOutput1` fixed it: first frame on the SSE at once. Aurora sets
  no DPI awareness anywhere (no manifest, no call). Tracked as `Aurora-8u3p`.
  `DuplicateOutput1` came in with `Aurora-wqzp.12` (HDR), a likely start point.
- Box: Intel UHD 770, RTX 3080 Ti, Meta Virtual Monitor. Monitors `DISPLAY13`
  2560x1440 primary, `DISPLAY12` 1920x1200. Not shown which part of this setup
  makes the DPI context matter.
- The earlier Windows gate runs (9/9) used `input="dummy"`, so they never covered
  desktop capture.

## Result (with the DPI patch)

- Live `recheck-audio`: `usesVideoInput` false, `usesAudioInput` true, no errors.
- Two video previews in a row: zones at brightness 0.114 and 0.115, no errors, live
  state unchanged during and after. Each preview logged one `DuplicateOutput1`
  `S_OK`, a dropped black placeholder, then published frames. The second opened
  cleanly, so the first preview's duplication had been released.
- One `DuplicateOutput1` `E_INVALIDARG` (`0x80070057`, "already duplicating this
  output" per the docs) appeared during the switch from video-live to
  `recheck-audio`. The retry 230 ms later succeeded. Which step (the
  `activeAudioInputName` PUT or the apply) was not pinned down. A reload that opens
  a new video input before the old one closes would produce this. It self-heals,
  costs one retry gap, and is not a preview-path issue.
- Not covered: a video preview opened while a test parks the video input
  (`m_parkedVideo`). Per the DXGI docs, a second duplication of the same output in
  one process fails with `E_INVALIDARG`.

## Resume

- The DPI patch and HRESULT logging are uncommitted debug edits in
  `Aurora-d0a-wt/input/windows/src/WindowsGrabber.cpp`. Discard them, the real fix
  belongs to `Aurora-8u3p`.
- Close `Aurora-4xqt.1` on this result, or after `Aurora-8u3p` lands and a rerun
  without the patch. Then `Aurora-4xqt.6`.
- Remove the `Aurora-d0a-wt` worktree when done.
