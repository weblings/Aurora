# Aurora-jm6s, tazx and kea closed; 2pe5, d3ec designed; 36b7, k73j and 9swq filed

Id: error-text-and-leak-beads

2026-10-05. Follow-on to [[mac-pause-verification-sck-crash]]: the beads filed there for the dashboard error text and the Hue mbedtls leak were reviewed against the code, tightened, and two were finished.

## Done

- **Aurora-jm6s (closed):** `web/ui/messages.js` exports `DAEMON_UNREACHABLE` ("Couldn't reach the daemon."); every literal in `web/ui` and the vendored demo copies imports it, including the three "Could not" sites (`app.js` boot error, `DashboardScreen._loadAll`, `ModeDeviceScreen`). `_loadAll` returns false when the daemon is unreachable. `_switchMode` no longer sets a toggle error for a thrown PUT; `_loadAll`'s message and the heartbeat overlay own that case. If the daemon answers the reload after a failed PUT (a blip), the unreachable toggle error is still set so the failed switch is not silent. `messages.js` added to the demo MANIFEST and vendored. Tests: four new DashboardScreen cases (4 mutants killed), new `messages.test.mjs` (source scan for spelled-out messages in both trees). Closed without the manual daemon-kill check (owner could not time the click): reopen if two unreachable messages show up in use.
- **Aurora-tazx (closed):** owner's Mac try-out: one message, no flicker on repeated clicks. Confirmed-switch clearing and the paused-switch case are unit-tested only. kea dependency dropped (the shared module is merged; kea waits only on Windows verification).
- **Aurora-kea (closed):** its code and tests were already committed; what held it open were unchecked screens. Closed on the strength of later Mac and Windows use (Dashboard seen in a browser in both modes on Mac during the tazx/axoz/36b7 tries; Windows build, ctest 68/68 and `/api/state`), with the Capture source screen on Mac and Windows, the Mac `--fresh` first launch, and a stale string moved to Aurora-9swq. Spot check of its acceptance in the code: no section-visibility `mode ===` gating left (the toggle's button state and `TuningFields`' field set, owned by jpq2, remain) and no `linux-audio` gate; `ZoneMappingScreen.js:244` still says "needs an active output and Video mode".
- **dev merge:** `dev` (Windows pause verification, lessons, `devstack.py`) merged in; conflicts were only `.beads/issues.jsonl` and `docs/log/INDEX.md`. Beads merged by issue id on raw lines, then `bd import`/`bd export` round-tripped with no differences (see the lesson on hand-resolved JSONL conflicts).

## Reviewed and rewritten (no code yet)

- **Aurora-2pe5:** root cause found by reading `MbedTlsImpl.hpp`, not a missing free: `MbedTlsDeleter` calls `FreeFunc(ptr)` but never `delete`s the structs `_initMembers` (5) and `_initRNG` (1) `new`ed. That is the ~6 blocks per rebuild. Fix is one line plus a new test (nothing in `output/hue/tests` constructs `DtlsClient`): dead localhost UDP port, `handshakeAttempts = 1` (`Streamer.cpp:43` hardcodes 4 at 400-1000ms), ASan+LSan on Linux (no sanitizer CMake preset; precedent `tools/fake-xdg-portal --asan`); `leaks(1)` for the Mac end-to-end check.
- **Aurora-d3ec:** unblocked in code (kea's `GET /api/state` is committed). Design rewritten: the startup build bypasses `PipelineHost` and `describeBuildError` (direct `Pipeline::build` in all three `app/*/src/main.cpp`), the error is stored only while no pipeline runs, tests listed. Step 4, the retry path after a startup failure, is open; research and four options are in the bead notes (recommended: Retry button calling `POST /api/reload`; not decided). The `Object { message }` console exception was dropped from scope (possibly a browser extension).

## Filed

- **Aurora-k73j (P4):** tray feedback when Resume fails (stderr-only in all three apps).
- **Aurora-9swq (P3):** kea's leftovers: the Capture source screen on Mac and Windows, the Mac `--fresh` first launch, and the `ZoneMappingScreen.js:244` copy (match the Dashboard's "…an active output and screen capture running").
- **Aurora-36b7 (P3):** Mac try-out of tazx showed the `DeviceField` hint swapping between a two-line video text and a one-line audio text, moving the UI below; the video text also reads "once Video mode finishes connecting" beside a permission error. Fix: hide the hint under an error, equal hint height.

## Findings

- Mac Audio and Video are separate stacks and separate grants: Video is ScreenCaptureKit (Screen Recording), Audio is a Core Audio process tap ("System Audio Recording Only"), denial inferred from silence. Both can be off at once, which is why tazx saw two messages.
- With no pipeline the Pause button is a silent no-op (see d3ec notes).
- `closure-check.mjs ../../../ui` reports `MacPermissionRecovery.js` reachable but not in the demo manifest, with or without these changes (the demo Dashboard drops the Mac banner).
- `bd` exports to `.beads/issues.jsonl` lazily; force `bd export -o .beads/issues.jsonl` before committing bead changes (already a lesson in [architecture-process.md](../lessons/architecture-process.md)).
- The tazx Mac try-out surfaced the 36b7 layout shift and showed Mac audio and video are separate grants; neither is a tazx defect.

## Lessons

- [language-cpp.md](../lessons/language-cpp.md): a `unique_ptr` deleter that calls only a C `*_free` leaks the `new`ed struct (2pe5's cause; diagnosed from code, fix pending).
- [components.md](../lessons/components.md): one failure rendered by two paths needs one owner (tazx, jm6s).
- [architecture-process.md](../lessons/architecture-process.md): extended the hand-resolved JSONL conflict entry (merge by id on raw lines; verify by import then export).
