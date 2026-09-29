# ImplementationPlan.md: staleness audit + split to Id:/`[[id]]` (2026-09-29)

Third real-content split using Aurora-lmn's mechanism, same pattern as the
mac split (Aurora-le6): audit first (Aurora-og2), split second (Aurora-d8g),
rather than a flat tag-and-convert.

Audit (Aurora-og2): `bd stale` found nothing (the beads themselves are
current), but `git log --follow` showed the file's last *substantive* edit
was 2026-09-20 -- the 5 commits since were docs-reorg path fixups or the
file's move into `docs/planning/`, not content edits. That 2026-09-20
`Status:` line for Phase 3 ("Milestone 2 in progress, Aurora-x7o") was
flatly wrong: Aurora-x7o had already closed 2026-09-28 as agent-proposed
scaffolding never committed to -- one of several docs this same session
already corrected for that reason (GUILaunchUX, HttpServerAnalysis,
WebUI_Design_1st/2ndPass), but ImplementationPlan.md itself was missed by
that sweep despite citing the same bead. Net of the section-by-section map:
~650 of 794 lines (82%) was shipped history or a superseded abandoned plan;
only ~140 lines (guiding principles + Phase 4 WebXR + Phase 5 ISF + stretch)
was genuinely still live planning.

Split (Aurora-d8g): trimmed to `Id: implementation-plan` (the ~140 open
lines). Shipped/superseded content split out to
`docs/archive/ImplementationPlan_{DirectoryLayout,EarlyPhases,Phase3}.md`.
Phase 3 Milestone 2's `Status:` corrected explicitly rather than archived
silently -- the MJPEG/SSE-preview native-WebUI plan it describes was never
built; what actually shipped is a different design, already migrated
([[webui-design-1st-pass]]/[[webui-design-2nd-pass]]/[[webui-fixes]]).
Fixed 6 external citers *outside* `docs/`'s scan scope (AGENTS.md,
`app/linux+windows/README.md`, `web/demo/{README,AGENTS,CLAUDE}.md`) to
`[[id]]` -- discovered `app/linux+windows/README.md`'s ImplementationPlan.md
links were already dead, silently broken since Aurora-o1e's 2026-09-28 move
of the file into `docs/planning/`, because `check-links.sh` never scans
those paths. Also corrected their stale "pairing/zone-mapping still
missing" claim, since both now ship via the WebUI.

~20 remaining `docs/archive/*.md`/`docs/log/*.md` citers still using the
bare `planning/ImplementationPlan.md` path were deliberately left for
Aurora-w4c (still resolves, just imprecise about which new file) -- see
`2026-09-29-remaining-docs-id-migration.md`. `check-links.sh` +
`check-lessons.sh` both clean.

Lesson extracted to `docs/lessons/architecture-process.md`: a citer
outside `docs/`'s scan scope can go dead on a doc move and nothing catches
it.

Beads: Aurora-og2 (audit, closed), Aurora-d8g (split, closed).
