# Docs & lessons: scaling pain points

Status: historical — the "Adopted design" and ranked backlog below are fully
executed (items 1-9 by 2026-09-21's monorepo reorg; item 10, the
`docs/archive/` split, by `Aurora-0ki` on 2026-09-28). Kept as the record of
why the current shape (`docs/lessons/`, `docs/log/`, `docs/archive/`,
`docs/WebUI/`, `check-links.sh`/`check-lessons.sh`) exists, not a live backlog.

Prompted by the `WebUI/` doc reorg (`WebUI_Design_1stPass.md`/`WebUI/WebUI_Fixes.md`/
`WebUI_Design_2ndPass.md`) — capturing *why* that reorg was needed, and being
honest that the lessons system meant to prevent this has the same disease.
Out of scope for now: whether a different tool/structure should replace the
markdown-file approach (see bottom).

## What actually happened here

`WebUIAnalysis.md` ballooned to 1704 lines — documented as its own lesson in
`lessons/engineering-hygiene.md`. `WebUIManualTweaks.md` was explicitly built
to avoid repeating that, with a line in its own header pointing straight at
the lesson that diagnosed it — and ballooned anyway, to 680 lines, via the
identical mechanism (design content accumulating in a doc meant to stay a
short nits list), inside the very conversation that relies on that lesson
existing. Writing the lesson down, and even linking it from the file at
risk, didn't prevent the recurrence: a prose lesson is inert, nothing
surfaces it at the moment a new paragraph is about to be appended, and each
individual addition looked locally reasonable — exactly what the original
lesson entry itself already says happens.

## The lessons system has the same disease it documents

- `lessons/engineering-hygiene.md`: 39 entries, 971 lines. `lessons/web-ui.md`: 16 entries,
  486 lines. `lessons/README.md`'s own routing rule says a file should split
  once it's "too long to skim (rough proxy: 15+ entries)" — both have been
  over that line for a while, un-split, because nothing prompts checking the
  threshold at the moment a new entry gets added. Same failure shape as the
  docs this system exists to keep from ballooning.
- `lessons/README.md`'s own index is one long hand-maintained prose paragraph per
  file — already borderline unreadable for `lessons/engineering-hygiene.md`'s entry
  (~90 lines of run-on clauses). The index meant to make lessons *findable*
  is itself becoming the kind of doc the splitting rule exists to catch.
- Retrieval depends entirely on an agent choosing to grep/read the right
  file at the right time — no tags, no "what's related to X," nothing
  structurally enforcing a check that a relevant lesson already exists
  before writing new content. Works at small scale; it's discipline by
  convention, not anything the storage shape enforces.
- Renaming/moving a doc (this session's own `WebUI/` reorg) required
  manually grepping every sibling repo for plain-text filename mentions and
  hand-editing each hit. No structural reference system caught the blast
  radius automatically — it only got caught because it occurred to check.

## Out of scope for now — revisit after the WebUI 2nd-pass overhaul ships

Whether an "agentic-native" database/knowledge-store tool exists that could
hold this project's tasks, docs, and lessons in one structured, queryable
place instead of hand-maintained markdown files plus a hand-maintained
prose index — while still rendering out to something a human can read
directly, not just a UI/API only an agent can use. Not researched yet;
flagged here so it doesn't get lost.

## Lightweight fixes (appended 2026-09-20)

No new platform; each item makes an existing rule active.

- Execute the existing split rule once: split `lessons/engineering-hygiene.md`
  (39 entries) along topic cuts into a subdirectory with its own
  `INDEX.md`, same shape as RockyRoad's `ui-toolkit/`/`engine/`.
  Replace the prose paragraph-per-file index in `lessons/README.md`
  with a table (`file | scope | entries | file-here-when`).
- Add one grep-able `Tags:` / `Applies-when:` line per lesson entry
  (e.g. `Applies-when: adding FetchContent URL`), so agents can
  find lessons with `rg` instead of knowing which file to read.
- Add the missing check: minimal per-bucket skills (or an `AGENTS.md`
  pointer) listing which lesson file to consult before which change,
  mirroring the RockyRoad per-bucket lesson skills already named
  in `lessons/README.md` as the intended fix.
- Make the 15-entry rule active with a tiny `check-lessons.sh`
  (`grep -c '^## '` + `wc -l`) as a pre-commit or CI warning,
  so exceeding the split threshold surfaces at append time.
- Separate append-only log from plan: move build-verified history out
  of `planning/ImplementationPlan.md` into dated `docs/log/*.md` entries,
  leaving the plan with `- [ ]` task checkboxes.
- Link hygiene: use markdown-link-only references plus a link checker
  instead of plain-text filenames needing manual cross-repo grep
  on every rename/move.

## Ranked backlog, lowest effort / most impact first (2026-09-20)

Decisions: Beads (`bd`) is the task/history option; Pagefind is a
stretch goal (needs a docs-build root first).

1. `AGENTS.md` pointer + minimal per-bucket skills — minutes to write,
   fires at the exact moment new content is added. Biggest leverage.
2. `Tags:` / `Applies-when:` line per lesson entry — incremental,
   makes `rg` retrieval work immediately without moving any file.
3. Replace `lessons/README.md` prose index with a table
   (`file | scope | entries | file-here-when`) — one small edit,
   fixes findability of the whole tree.
4. `check-lessons.sh` (entry/line counts) as pre-commit or CI warn —
   tiny script, makes the 15-entry split rule actually fire.
5. Beads for tasks/history — medium effort (install `bd`, migrate
   `planning/ImplementationPlan.md` phases), removes the largest bloat source
   from plan docs and gives agents `--json` + ready-work queries.
6. Split `lessons/engineering-hygiene.md` once along topic cuts — medium-large
   one-time edit; do after 1–4 so the new shape holds.
7. Separate append-only log (`docs/log/*.md`) from the plan —
   medium; pair with 5, since Beads absorbs most of what the log held.
8. Markdown-link-only references + link checker — small-medium,
   pays off on the next rename, not today.
9. Pagefind docs site — stretch. Largest effort (needs a build root
   pulling in sibling `docs/` dirs); human search win only.
10. Archive process for plans of built features — option (a) done 2026-09-20 (Aurora-jkl); (b)/(c) still open.
   decided. Planning docs (ImplementationPlan phases 1-2.5, WebUI 1stPass
   sections) now read as plans for done work: the same accretion disease
   as the WebUI ballooning, one lifecycle stage later. Milestones already
   have a home (closed beads + dated logs); the gap is the plan side.
   Candidate shape, cheapest first: (a) one `Status:` header line per
   planning section (unbuilt / in-progress with beads link / shipped date
   with log link), maintained incrementally, no moves; (b) whole-file
   archival to `docs/archive/` with a pointer stub left behind once a
   planning doc is fully realized; (c) a `check-plan.sh` enforcing (a),
   if (a) rots like the 15-entry rule did. Small-medium effort; keeps
   plans plannish. Pairs with the monorepo: slices share the one docs
   tree, so the convention, once set, covers all future platforms.

## Adopted design (2026-09-20, supersedes details above where they differ)

- Query-coherent splits, not count-based: the 15-entry rule was an ungrounded
  human-skim heuristic (measured: tag grep is 0.00s at 114 entries / 3422
  lines). Files subdivide when their query vocabulary gets muddy.
- Skills read tag-first: grep `Tags:`/`Applies-when:`, read matches — never
  whole files. This, not splitting, is what makes size cheap for agents.
- `check-lessons.sh` enforces the retrieval contract (tag placement, index
  counts), not the count rule. `check-links.sh` verifies links + bare refs
  with an explicit grandfather list — anything new and unresolvable fails.
- Cite by headline/topic, files by markdown link, external lessons by topic +
  repo. URLs single-sourced in `AGENTS.md`; per-lesson IDs judged overkill
  at this scale (tags already serve as lightweight IDs).
- Beads is the queue (open/blocked/deferred/closed with true historical dates
  via JSONL import); `docs/log/` is the record (every material fact, stated
  once and tightly — findings over narration); planning docs keep decisions,
  status, pointers only. Paused work logs state + resume pointer.
- The what-goes-where breakdown lives in `AGENTS.md` ("Where things go") —
  that section, not this doc, is the contract new work follows.
- Workstream record: [log/2026-09-20-docs-system-overhaul.md](../log/2026-09-20-docs-system-overhaul.md) —
  what shipped, decisions, and open remainder. Task history in closed beads
  (`bd list --status all`, labels `docs`/`migrated`/`phase-*`).

## Process gaps found doing the archive split itself (appended 2026-09-28)

Item 10 above (archive process) got done this session
(`log/2026-09-28-docs-archive-and-assets-reorg.md`, `Aurora-0ki`/`Aurora-rtp`/
`Aurora-o1e`/`Aurora-afd`), but doing it by hand — reading edit history,
diffing bead timestamps, re-deriving which docs were actually stale —
surfaced six process gaps that would have made the outcome fall out
naturally instead of needing a retroactive sweep:

1. **Archive-on-close, not archive-later.** Every doc archived this session
   was already done the moment its phase/milestone shipped, but nothing
   moved it then — some sat live for two weeks. Milestone close-out
   (already a defined step: dated `docs/log/` entry + `INDEX.md` row)
   should also archive that milestone's prerequisite analysis docs and
   correct their `Status:` lines, in the same action, not as separate later
   cleanup.
2. **Run `bd stale` instead of hand `git log` archaeology.** It already
   exists and would have flagged `Aurora-f06` and `Aurora-x7o` as
   untouched-since-creation immediately, instead of needing manual
   `git log --follow` date-diffing across five files to notice the same
   thing.
3. **Wire `check-links.sh`/`check-lessons.sh` into CI or a pre-commit
   hook.** The stale `'Analysis'` base in `check-links.sh` sat silently
   checking nothing under `docs/` for 8 days because nothing runs it
   automatically — it only fires when someone thinks to type the command.
4. **Mark agent-proposed plans as proposed, not committed.**
   `Aurora-x7o`'s "Phase 3 Milestone 2" framing calcified into what looked
   like a real roadmap item because nothing distinguished "an agent
   suggested this shape" from "the owner signed off on it." A `proposed`
   label that has to be explicitly promoted before a bead can carry a
   `phase-*` label would stop that drift at the source.
5. **Write the convention down before the first violation, not after.**
   `docs/README/` holding build-input assets and `check-links.sh` never
   scanning `docs/` were both "obviously wrong in hindsight," but nothing
   in `AGENTS.md` said otherwise until this session forced the issue.
6. **Make "run quality gates" concrete in the session-close checklist.**
   Both the `bd prime` hook's close protocol and `AGENTS.md`'s own
   "Session Completion" section say "run quality gates" without naming
   which ones — satisfied today by `ctest` alone, never `bd stale` or the
   two `check-*.sh` scripts. Naming them explicitly in that step is what
   would make gaps 2 and 3 above actually fire every session instead of
   needing a human to think of them.

## Process gaps found building the doc-linking mechanism (appended 2026-09-29)

Scoping the `MacSupport.md` split into `docs/archive/mac`/`docs/planning/mac`
(`Aurora-lmn`/`Aurora-le6`/`Aurora-4ux`, `log/2026-09-29-doc-linking-mechanism.md`)
surfaced three more gaps, on top of the six above:

1. **Path-based citations have no cross-subtree verification, by design, not
   by oversight.** `check-links.sh` only ever walked *upward* from a citing
   file's own directory — it can't see sideways from `docs/log/` into
   `docs/archive/mac/`, so a citation into a sibling folder can go stale
   without the checker ever catching it, independent of gap 3 above (the
   checker running at all). Fixed with an id-based index
   (`Id:`/`[[id]]`, `docs/README.md`) instead of teaching the walk to search
   sideways — a directory-walk model has this limitation structurally.
2. **A hand-merged `.beads/issues.jsonl` needs an explicit `bd import` step
   that nothing prompts for.** Resolving the `dev`-branch merge conflict in
   the tracked export by hand left 6 issues the live Dolt DB never saw —
   caught only because a later `bd create` refused to auto-export over it,
   not because anything in the merge workflow said to reconcile first. The
   existing "after `git pull`, run `bd import`" guidance (`AGENTS.md`) covers
   pulls; it doesn't mention merges, which hit the same divergence from the
   opposite direction.
3. **A directory-structure precedent that isn't written down gets
   re-derived from git history every time, at conversation cost.** Whether
   `docs/archive/`'s topic docs should be a real folder or flattened with a
   filename prefix wasn't answered by `docs/README.md`'s own bucket
   description — it took `git log --follow -- docs/WebUI/` to discover
   `docs/WebUI/` *was* a real folder (no README, direct cross-citation)
   before the one-off flattening in `Aurora-c90`. Worth writing that
   precedent into `docs/README.md` directly once, rather than leaving it
   recoverable only by archaeology.
