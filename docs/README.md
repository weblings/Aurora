# Aurora docs

Map of what's here and when something belongs where. Day-to-day filing
rules (which bucket a new doc/task/lesson goes in) are the full contract in
the root [`AGENTS.md`](../AGENTS.md#where-things-go) — this file is the
orientation map for anyone browsing straight into `docs/`, plus the
checklist to run when doing a periodic organization/reorg pass.

## What's here

- **`archive/`** — shipped, superseded, or abandoned plans and analyses.
  Historical record: don't delete or edit into the present tense, only add
  a corrected `Status:` line naming what actually happened.
- **`planning/`** — still-active, not-yet-decided plans (the roadmap,
  unstarted platform exploration). Distinct from `archive/`: nothing here
  should be treated as settled just because it's written down.
- **`WebUI/`** — WebUI-specific design passes and their supporting docs
  (tooltip content/plumbing, etc.), kept together rather than at root.
- **[`lessons/`](lessons/README.md)** — non-obvious gotchas, tagged and
  routed by `.claude/skills/`. See its own `README.md` for filing rules.
- **`log/`** — append-only, dated record of closed/paused milestones. See
  [`log/INDEX.md`](log/INDEX.md).
- **Root** (`Building.md`, `MacSupport.md`, `UpstreamFindings.md`) —
  operational reference and narrow standalone docs that don't fit any
  bucket above. Kept intentionally small; if root starts accumulating
  files again, that's the signal to run the checklist below, not to add
  another folder reflexively.

## Doing an organization/reorg pass

A doc's own `Status:` line is only as trustworthy as its last real edit —
don't take "exploratory"/"in progress"/"not decided yet" at face value.
Before archiving or re-filing anything:

1. **`bd stale`** — surfaces beads that look active but haven't moved
   recently (default 30 days; this project ships fast enough that even a
   week is worth a look). A bead whose description still names the
   pre-rename `Analysis/` path, or hasn't updated its own timestamp since
   creation, is a sign nobody's actually tracking it — don't treat it as
   evidence that a doc citing it is still current. `bd stale` only
   reports; it always exits 0, so it won't block anything on its own — run
   it deliberately, don't wait for a hook to remind you.
2. **For any doc whose `Status:` claims still-open work**: `git log
   --follow -- <path>` and find the last *substantive* edit (not a rename
   or link-hygiene pass). If nothing revisited it across real, related
   shipped work since, it's stale regardless of what it claims — check
   what actually shipped in that area before trusting the doc over the
   code.
3. **`python3 check-links.sh` and `bash check-lessons.sh` after every
   move.** Both are lenient about *which* directory a bare citation lives
   in (a citation resolves if the target exists anywhere from the citing
   file's directory up to the repo root), so a clean run doesn't guarantee
   every real `[label](href)` link is a *correct* relative path — verify
   those by hand for actual navigability, especially after moving a file
   into a new subdirectory.
4. **Archive-on-close is required, not deferred** (see `AGENTS.md`): when
   closing a phase/milestone bead, archive its prerequisite doc and
   correct its `Status:` line in that same close. If you're running this
   checklist retroactively over several already-closed beads, that's a
   sign step 4 was skipped upstream — worth fixing the habit, not just the
   backlog it left behind.
