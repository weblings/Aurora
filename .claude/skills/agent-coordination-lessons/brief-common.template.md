# Common brief template

Copy into the coordinator's scratchpad as the common brief, fill every
`<...>`, and delete lines that do not apply. Each per-bead brief opens with
"Read the common rules first and follow them exactly: <path to the common brief>
(progress file: progress-<bead>.txt)". Each spawn prompt only points at the
per-bead brief. Edit this file mid-run (known failures, new gotchas): agents
spawned later pick the change up. Keep it in step with
`docs/lessons/agent-coordination.md` (lesson "Keep the shared agent rules in
one common brief file").

---

## Common rules for every <epic> agent (<OS>, <shell>)

- Repo: <repo path>, branch <branch>. Share the tree, no worktree.
- Read your bead first: `.beads/issues.jsonl` (grep the id). Description, NOTES and ACCEPTANCE are the spec; a later dated note SUPERSEDES earlier text. Do NOT run any `bd` command. Put drafted bead text (notes, follow-up bugs) in your report.
- Do NOT commit, push, close beads, or edit CHANGELOG.txt. Leave changes in the tree. The coordinator verifies and commits.
- Before writing code read: <slice README>, docs/lessons/components.md, <other topic lessons>. Import shared web/ui modules and Grille pieces, never copy them. <Reference mock, if any: port from it, leave it unchanged.>
- Code comments: 2 lines max each.
- Stack lock: wrap EVERY browser check and every `npm run build` in the lock, and release it also on failure.
  - Windows (Git Bash): `L=<scratchpad>/check.lock; until mkdir "$L" 2>/dev/null; do sleep 5; done; <cmd>; rc=$?; rmdir "$L"; (exit $rc)`
  - macOS: `/usr/bin/lockf -t 1200 <lockfile> <cmd>` (call lockf directly, never from a variable).
- Windows: pass C:/... paths to Node, never /c/... .
- Do NOT start any server (auto mode denies it). <The coordinator serves the page at http://127.0.0.1:<port>/>; if it does not answer, stop and report.
- C++ tests: run each new test by its exact name as well as any `ctest -R` filter (filters are case-sensitive), or the full `ctest -j8`.
- On "timed out waiting for a frame": check port 8215 (`netstat -ano | grep ':8215 ' | grep LISTEN`, or `lsof -nP -iTCP:8215 -sTCP:LISTEN`), then STOP and report; do not retry.
- Iterate with typecheck, unit tests and ONLY the one browser check named in your brief, and only with a hypothesis. Run the regression set once at the end, each check by the exact command your brief gives. Report each run's name, result and time.
- Known baseline failures: <none | list with bead ids>. Uncommitted files you did not touch belong to other beads: do not revert, stash or reformat them.
- If a check fails and you cannot tie it to your change, say so; do not stash or swap files.
- Browser checks: select menu items by name, never by position. Move the pointer off any tooltip trigger before an Escape step (an open hover tooltip takes the first Esc). After any keyboard step, press the pointer once before a hover that expects a tooltip (React Aria shows hover tooltips only in pointer modality).
- Progress file: append a timestamped line to <scratchpad>/progress-<bead>.txt at each milestone (read spec, first build green, check passing, regression done).
- Hand back ONCE, after your own check runs have finished. Never hand back while a background run of yours is still pending.
- Report: files changed, what was built against each acceptance line, check runs with timings, anything left undone, drafted bead text, a 1-paragraph docs/log draft.
