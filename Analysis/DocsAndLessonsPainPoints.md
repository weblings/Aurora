# Docs & lessons: scaling pain points

Prompted by the `WebUI/` doc reorg (`WebUI_Design_1stPass.md`/`WebUI_Fixes.md`/
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

- `engineering-hygiene.md`: 39 entries, 971 lines. `web-ui.md`: 16 entries,
  486 lines. `lessons/README.md`'s own routing rule says a file should split
  once it's "too long to skim (rough proxy: 15+ entries)" — both have been
  over that line for a while, un-split, because nothing prompts checking the
  threshold at the moment a new entry gets added. Same failure shape as the
  docs this system exists to keep from ballooning.
- `README.md`'s own index is one long hand-maintained prose paragraph per
  file — already borderline unreadable for `engineering-hygiene.md`'s entry
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
