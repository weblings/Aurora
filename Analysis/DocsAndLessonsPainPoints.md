# Docs & lessons: scaling pain points

Prompted by the `WebUI/` doc reorg (`WebUI/WebUI_Design_1stPass.md`/`WebUI/WebUI_Fixes.md`/
`WebUI/WebUI_Design_2ndPass.md`) — capturing *why* that reorg was needed, and being
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
  of `ImplementationPlan.md` into dated `Analysis/log/*.md` entries,
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
   `ImplementationPlan.md` phases), removes the largest bloat source
   from plan docs and gives agents `--json` + ready-work queries.
6. Split `lessons/engineering-hygiene.md` once along topic cuts — medium-large
   one-time edit; do after 1–4 so the new shape holds.
7. Separate append-only log (`Analysis/log/*.md`) from the plan —
   medium; pair with 5, since Beads absorbs most of what the log held.
8. Markdown-link-only references + link checker — small-medium,
   pays off on the next rename, not today.
9. Pagefind docs site — stretch. Largest effort (needs a build root
   pulling in sibling `Analysis/` dirs); human search win only.

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
  via JSONL import); `Analysis/log/` is the record (every material fact, stated
  once and tightly — findings over narration); planning docs keep decisions,
  status, pointers only. Paused work logs state + resume pointer.
- The what-goes-where breakdown lives in `AGENTS.md` ("Where things go") —
  that section, not this doc, is the contract new work follows.
