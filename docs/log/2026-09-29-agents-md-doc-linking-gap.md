# AGENTS.md pointed at nothing for the Id:/`[[id]]` convention; 5 dead BrowserAnalysis.md citers (2026-09-29)

Aurora-6wg, from a user question: "is the AGENTS.md-to-docs/README.md
logic robust enough a new agent won't start pathing rather than make a
link for new docs?" Answer was no, on inspection -- confirmed by both a
structural gap and live dead links.

Structural gap: `AGENTS.md`'s "Where things go" section, the entry point
before filing/citing any doc, never mentioned `Id:`/`[[id]]` or linked to
`docs/README.md` at all -- only `docs/lessons/README.md`, for a different
topic. An agent that only reads `AGENTS.md` had no way to discover the
convention exists.

Live evidence: `AGENTS.md` itself cited the pre-move BrowserAnalysis path,
dead since the file moved to [[browser-analysis]] during Aurora-w4c the
same day -- not just stale, dead,
and modeling the wrong citation style. Same dead path also found in
`web-processing/README.md`, `web/demo/{README,CLAUDE,AGENTS}.md`. None of
these were caught by `check-links.sh` (scans `docs/` + `.claude/skills/`
only) or by Aurora-w4c's migration, which was scoped to `docs/` and
skipped the repo-wide external-citer grep that Aurora-d8g's
ImplementationPlan.md pass did do -- a recurrence of a lesson already on
file from that same pass.

Shipped:
- All 5 dead citations converted to `[[browser-analysis]]`.
- `AGENTS.md` gets a new "Where things go" bullet naming `docs/README.md`'s
  convention and `check-links.sh`'s scan boundary explicitly.
- `docs/README.md`'s reorg checklist gets a new numbered step making the
  repo-wide `grep -rn '<old-filename>' .` a fixed step on any doc
  move/rename/first-`Id:`, not a judgment call -- since the existing
  lesson entry alone didn't survive into the very next migration bead.
- Lesson entry in `docs/lessons/` ("A citer outside docs/'s scan scope...")
  extended with the recurrence and the checklist fix, rather than filed
  as a new entry.

`check-links.sh` + `check-lessons.sh` both clean. Repo-wide grep for all
17 migrated files' pre-move `docs/<Name>.md` paths outside `docs/` came
back empty after the fix -- no other stragglers.

Beads: Aurora-6wg (closed).
