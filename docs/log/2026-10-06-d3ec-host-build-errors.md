# Aurora-d3ec: host holds build errors, GET /api/state reports state

Id: d3ec-host-build-errors

2026-10-06. Core half of [[error-overlay]] (Sequencing step 0). PAUSED, not closed: core built and tested on Mac; Linux/Windows and the commit remain. Resume: Remaining, below.

## Done

- **Bead state repaired first.** d3ec was still the pre-narrowing WebUI bead and cj11/m0fy/q9l1 did not exist in the live DB. Commit 7395754 claimed the split, but its export lagged (debounced auto-export, see the architecture-process lesson on it), so the JSONL had only ewyz; d9bf481 (22:02, this branch) exported the rest, and the live DB still needed `bd import`. Resolved the pending `dev` merge's `docs/_ids.md` conflict (kept all rows, alphabetical), ran `bd import` (332 issues, 5 updated), then confirmed with `bd show` on every id.
- **Decisions recorded on d3ec** after an option comparison: A2 `PUT /api/state {running:true}` on a failed host is a retry (same attempt as `POST /api/reload`); `running:false` with nothing to pause answers 409 `nothing_to_pause`. B1 `errors` is an array of `{source, message}`, source unique, at most one entry today (any successful build clears all). C1 as first written was wrong, see Findings.
- **Core** (`Pipeline.hpp/.cpp`, `PipelineRoutes.cpp`): `HostState idle|running|paused|failed`, `HostStatus{state, errors}` behind `m_statusMutex` (leaf, taken after `m_mutex`), republished at every site that changes `m_pipeline`/`m_paused`. Errors sources `startup` (ctor takes the first build's `exception_ptr`), `resume`, `reload`; stored only while no pipeline runs, decided under `m_changeMutex`+`m_mutex`. `setRunning(true)` on a failed host calls `reload`; `setRunning(false)` with nothing to pause returns `kNothingToPause`. GET `/api/state` gains `state` and `errors` (`paused` now from the snapshot); PUT returns `{succeeded, running (state is running), state}`.
- **Apps:** all three mains keep the stderr line and pass `std::current_exception()` to the host. Tray log reworded to "Tray pause/resume failed:" since a Pause click can now return `nothing_to_pause`. Mac built (`build/mac-app`, 69/69). Linux/Windows edits are the same three lines, not compiled here.
- **Tests:** 8 new Catch2 cases + 2 updated; core 171/171. Mutation-checked: dropping the "pipeline running" guard fails the late-failure and reload-running tests; making `status()` wait on `m_pauseMutex` fails the blocked-resume test.
- **Docs:** [[error-overlay]] corrected (idle state, array shape, onboarding gate); d3ec design rewritten core-only; notes added to cj11 and 5ipy.2.

## Findings

- **A fresh install is `idle`, not `failed`.** `Pipeline::build` returns null (no throw) while no input is configured. The plan's "first build fails by design" is true only mid-onboarding: input saved, no output paired, reload throws "No outputs available" (reproduced live: `failed`, then `reload` source). cj11's onboarding gate must target that, not `startup`.
- **Live Mac, temp `AURORA_CONFIG_DIR`, bogus input:** `failed` + `startup`; PUT false 409; PUT true retries, fails again, source becomes `reload` (a later failed build replaces the earlier error; seen again on the real config after a manual PUT).
- **Mac grant, `open`-launched ad-hoc Aurora.app, macOS 27:** first attempt "grant did not apply live" was a stale entry (binary rebuilt 22:15, grant toggled after). After `tccutil reset ScreenCapture com.aurora.app`, relaunch (`failed`/`startup`/`permission_denied:`), grant without quitting, `PUT running:true` returned `running`: a fresh grant applies to the running process. Wording can lead with "turn it on, then try again"; quit-and-reopen stays as fallback. Linux portal and the audio tap unchecked.
- **Test-harness traps:** a fake's hook fires once per output (two), and a `REQUIRE` with a joinable worker thread aborts; `timeout` does not exist on macOS, so the first lock-free mutation run printed nothing and passed by absence until redone with `perl alarm`.

## Remaining

- Linux live check (bogus `activeInputName`, output.md:388), Linux and Windows compile.
- Stage the re-exported `.beads/issues.jsonl` with the pending `dev` merge, commit, then close d3ec.
- Next: Aurora-cj11 (banner, Retry, onboarding gate on the mid-onboarding `reload` error, Mac wording), then k73j/q9l1. Aurora-5ipy.2 now only extends the route.

## Footnotes

- 1 lesson added (state + errors as one leaf-locked snapshot), 4 extended (idle as a fourth no-pipeline cause; hook-per-output and release-before-assert; macOS `timeout` recurrence; a claimed bead split must be `bd show`n and the DB imported after the fixing commit lands). The Mac grant follow-up went into the existing input.md entry. `check-lessons.sh` and `check-links.sh` green.
