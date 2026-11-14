# Agent coordination

Id: lesson-agent-coordination

Running several agents on a sequence of beads: preflight, briefs, the shared browser-check stack, watching a running agent, verifying and committing. See [README.md](README.md) for filing rules. Code conventions an agent must follow go in the topic files (e.g. components.md), not here.

---

## The browser-check stack is one per machine, so parallel agents need a lock and a free port 8215, not worktrees
Tags: devstack, browser-check, subagents, parallel, worktree, lockf, port-8215
Applies-when: more than one agent or terminal will run `tools/browser-check` checks (or `vite build` of the graph editor) at the same time

Aurora-u8jx.4 (2026-11-13): five agents shared the tree, three ran checks at once. `devstack.py` binds fixed ports (18443, 18244, 18245, the viz port, WebUI from 8215), keeps its state in `<tmp>/aurora-devstack` and runs `build/mac-app` of the main checkout. A worktree isolates none of that, and has no app build of its own. Two agents then burned every check run on `timed out waiting for a frame`: the owner's own Aurora held 8215 (see "A fail-soft port bind turns "something else owns the port" into a harness timeout about frames"), and no agent brief mentioned it.

**Fix:** before fanning out, run `lsof -nP -iTCP:8215 -sTCP:LISTEN` once and ask the owner to quit a non-stack Aurora. Then share one tree and wrap every check and every `npm run build` in `/usr/bin/lockf -t 1200 <lockfile> <cmd>` (macOS; releases on exit, no stale lock). Tell each agent: on a frame timeout, check 8215 and stop rather than retry. Call `lockf` directly or through a shell function, never from a variable: zsh does not word-split `L="lockf ..."; $L cmd` and fails with "no such file or directory" (2026-11-13).

---

## Run the affected browser checks once on the base commit before the first agent starts
Tags: browser-check, baseline, epic, subagents, regression, preflight
Applies-when: starting a multi-bead epic or fanning out agents whose work will be judged by browser checks

Aurora-9hqa (2026-11-13): each bead ran only the checks it named. `graph-editor:failed-save` was already failing before the epic began (a stale premise, Aurora-bju0), but it surfaced mid-epic, an agent could not tell whether its change caused it, and proving it pre-existing took a stash and re-runs on two older commits.

**Fix:** before the first agent, run every check the epic could touch on the base commit, note what already fails, file it, and tell each agent which failures are known and not theirs.

Confirmed by skipping it (ngoj, 7a-7c, 2026-11-13): no baseline was run, `graph-editor:gate` turned out to be failing before the session (Aurora-4ccg), and it surfaced only in 7a, where the agent and then the coordinator each spent a run and a file swap proving it pre-existing.

Confirmed by running it (Aurora-4ccg, 2026-11-13): the bead carried a coordinator's hypothesis from a code read (the gate's missing agent heartbeat), and the owner had approved a check-only fix on it. The baseline showed a sibling check that does heartbeat failing at the same step, which disproved it before any agent was briefed. Treat a bead's written cause as a hypothesis until a run backs it, and look for sibling checks that exercise the same path.

---

## Write owner decisions into the bead before work starts, not only into the conversation or a brief
Tags: beads, decisions, briefs, subagents, context, handover
Applies-when: the owner settles a sequencing, scope or design question in conversation and someone (an agent, a later session, a person) will build from the bead

Aurora-9hqa (2026-11-13): before fan-out the owner re-ordered the beads, asked for saved browser checks and moved pairing into an earlier bead. Each decision went into the beads as a dated note (marked SUPERSEDES where it replaced an older note) and, where it changed what "done" means, into the acceptance criteria, with the dependency edited to match. All five agents built from `bd show` and got it right; the brief only had to point at it. The beads' own design history (mocks, earlier sessions) reached the builders the same way.

**Fix:** record the decision on the bead first: dated note, SUPERSEDES for a reversal, acceptance criteria and dependencies updated. Then brief.

---

## While iterating, an agent runs only the browser check it is changing; the regression set runs once at the end
Tags: browser-check, speed, subagents, briefs, iteration
Applies-when: briefing an agent whose work is verified by `tools/browser-check`

Aurora-9hqa / Aurora-bju0 (2026-11-13): the shell checks are slow (error-shell ~146 s, dashboard-shell 150-226 s; stack up/down is ~1 s, the time is in poll waits). Agents that re-ran their 6-7 check set after each fix spent 10-15 min per bead on checks, and queued behind each other on the stack lock. Told to run only `failed-save` while iterating, and only with a hypothesis, the bju0 agent made two quick runs (28 s, 13 s) and one final 4-check set: 9 min for the whole bug. Making the checks themselves faster is Aurora-ngoj. Done 2026-11-13: the three shell checks now take 38-46 s, and with them each editor bead's final check set (7a, 7b, 7c) was about 2.5 min with no repeated runs. The rule still holds.

**Fix:** in each brief, name the one check to iterate on and the regression set to run once at the end, and ask for the run count and timings in the report.

---

## Give each agent a progress file, and escalate a quiet one with a message before stopping it
Tags: subagents, progress, monitoring, escalation
Applies-when: an agent runs long and someone needs to know where it is

Aurora-u8jx.5 (2026-11-13): an agent ran for 30 minutes and the owner asked whether it was stuck. Its transcript was too big to read, so where it had got to had to be pieced together from file modification times, `git status` and `pgrep` for running checks. That showed it was finishing its regression checks, but only roughly. Later briefs asked each agent to append a timestamped line to a progress file in the scratchpad at each milestone, and each could then be checked at a glance.

**Fix:** put the progress-file instruction in every brief. A quiet agent (no file change and no check running for ~10 min, or the same check re-run repeatedly) gets a message first; stop it only if that fails, then carry on from its partial work. A missing progress line is not proof the agent is idle: the Aurora-91cj agent (2026-11-13) could not append after its second entry and still finished, so check `git status` and running checks before messaging.

---

## Before attributing a failing check to the change under review, run it on the commit before
Tags: browser-check, regression, baseline, git-stash, triage, subagents
Applies-when: an agent reports a failing check it cannot tie to its own change

Aurora-u8jx.5 / Aurora-bju0 (2026-11-13): an agent reported `graph-editor:failed-save` failing where Aurora raised no error at all. `git stash -u`, the check on HEAD, then `git checkout <pre-epic sha> -- web/ui web/graph-editor/src tools/browser-check` and the check again (restore afterwards with `git checkout HEAD -- <dirs>` and `git stash pop`) showed it failing before the epic, so the bead was committed and the failure filed as its own bug instead of holding the work.

**Fix:** reproduce on the previous commit and on the base of the work before blaming it. If it fails there too, file a bug with that evidence and carry on. Do the swap from the repo root with absolute paths in any `trap` (a trap after `cd tools/browser-check` resolved `web/ui` against the wrong folder and left the base files staged, 2026-11-13), and restore in the order `git checkout HEAD -- <dirs>` then `git stash pop`, never the reverse: a checkout after the pop wipes the popped edits (recovered that time from the dangling stash commit, `git fsck --no-reflog`).

---

## Beads that touch the same files run one at a time; the coordinator re-runs the gates and commits each bead
Tags: subagents, sequencing, waves, commits, verification, gates
Applies-when: planning how many agents to run at once and how their work lands

Aurora-9hqa (2026-11-13): all five beads changed the same row model, `shell.js`, `shell.css` and `ErrorShell.tsx`, so they ran one at a time with a review and commit between agents. Aurora-u8jx.4 had independent beads, which ran in waves grouped by file overlap. In both cases the agents did not commit. The coordinator re-ran every gate itself (unit tests, typecheck, build, the browser checks), looked at one screenshot the agent had not opened, and committed one bead per commit. That re-run is what caught a bug in the coordinator's own follow-up edit, and an agent copying shared logic instead of importing it.

**Fix:** group beads by file overlap; one agent per group at a time. Agents leave changes in the tree; the coordinator verifies independently, closes the bead and commits it alone.

A core-only bead can run beside an editor/check bead in the same tree (Aurora-91cj beside Aurora-ngoj, 2026-11-13) if the core agent builds only `build/core-tests`, never `build/mac-app`. The check agent's app rebuild still compiles whatever half-finished core edit is in the tree, so the coordinator commits the core bead, rebuilds `build/mac-app`, and only then re-runs the check bead's gates. Check timings from such a wave are inflated by the core build (graph-editor:narrow took 272 s beside Aurora-ajr5 and 24 s alone, 2026-11-13); read slowness there as load, not a regression.

---

## A bead that edits the API spec must regenerate openapi.json, and the commit hook needs the spec venv
Tags: openapi, api-spec, commit-hook, briefs, subagents, venv
Applies-when: briefing an agent whose change adds or changes a field in a route's JSON (`docs/api/openapi.yaml`)

Aurora-u8jx.3 (2026-11-13): the agent added `code` to the preview errors and to `openapi.yaml`, but not to the generated `docs/api/openapi.json`. The pre-commit API spec hook first refused for a missing tool ("python3 lacks docs/api/requirements.txt deps"), then, once it ran, for the stale JSON. Neither the agent's gates nor the coordinator's re-run covered it; only the commit did.

**Fix:** in a brief that touches a route's JSON, ask for `python docs/api/gen-openapi.py` after editing `openapi.yaml`. The coordinator keeps a venv from `docs/api/requirements.txt` (scratchpad is fine) and commits with `AURORA_API_PYTHON=<venv>/bin/python`, never `--no-verify`.

---

## Copy a flaky test's failure output into its bead when filing it; the next run overwrites the log
Tags: flaky-test, ctest, LastTest.log, beads, triage, evidence
Applies-when: a test fails intermittently during a bead's verification and is filed as its own bug instead of being chased

Aurora-yqu8 (2026-11-13): a settings test failed twice under `ctest -j8` and was filed with its name only. `build/core-tests/Testing/Temporary/LastTest.log` held the failing assertions, but the next full run overwrote it. Without them nobody could tell a harness limit (fix the test) from a lost update (fix the code), so the bead could not say which. The output turned up only because the flake recurred in the coordinator's ajr5 review run: `succeeded` 5 == 8 with the coordination checks passing pointed straight at transport failures, and the agent's first step became "record each request's outcome" instead of a guess.

**Fix:** when you file a flaky test, paste the failed CHECK lines with their expansions into the bead (or copy the log to a dated file the bead names) before running anything else. A bead for a flake names which assertion fails.

---

## When a change replaces how a value is derived, the brief asks for every path that set it the old way
Tags: briefs, subagents, review, coverage, refactor, dev-flags
Applies-when: briefing or reviewing an agent whose change swaps the inputs of a computed value (a flag, a capability, a mode) for new ones

Aurora-ajr5 (2026-11-13): pipeline capabilities moved from `!m_isAudioMode` / `m_isDualCapture` to the running graph's nodes. The agent reported that dual capture "reports what it did before" because the existing tests passed. `m_isDualCapture` is set in two places, and the `AURORA_DEV_DUAL_CAPTURE` spike has no test: it runs the built-in audio graph beside the video graph that `graphJson()` returns, so it would have lost `usesAudioInput`. The coordinator found it only by grepping the flag's assignments on review.

**Fix:** in the brief, ask the agent to grep every assignment of the old inputs and say, path by path, what the new derivation gives there, naming any path no test covers. On review, run that grep yourself. Passing tests prove only the paths that have tests.
