# Docs-system overhaul (2026-09-20)

One-off workstream: make Analysis/ enforce its own structure (lessons, tasks,
history) for humans and agents. Prompting assessment: content strong,
enforcement honor-only, retrieval grep-by-discipline.

Shipped:
- Tags + Applies-when on all lesson entries (114); 6 per-bucket skills,
  rewritten tag-first (grep matches, never whole files).
- check-lessons.sh (tag placement, index counts) and check-links.sh (links +
  bare refs, explicit grandfather list) — both green. Honor system kept over
  hooks; checkers run manually/by convention.
- Query-coherent split 7 files into 16 + stubs; README table + routing rewrite;
  heading-citation convention (filenames don't survive splits).
- Beads adopted: 46 issues; plan phases imported closed with true git dates via
  JSONL import (timestamps preserved); stretch deferred; per-doc triage beads
  for leftovers. export.auto on, export.git-add off; forced export before adds.
- History extracted to dated logs (plan, WebUI build, 2 analysis follow-ups);
  log/INDEX.md; close-out rule in AGENTS.md (material facts, stated tightly;
  paused work logs state + resume pointer).
- PainPoints doc: ranked backlog + adopted-design record. AGENTS.md: where-goes-where,
  related repos (RockyRoad x2, huenicorn), no per-lesson IDs, URLs single-sourced.

Decisions: honor over hooks; no Pagefind yet (stretch); tasks-only imports,
planning left in docs; external refs by topic, never path.

Open:Pagefind docs site; hardware-gated product items (Ubuntu e2e, live timing,
backport verify); WebUI bug cluster is the active product front.
