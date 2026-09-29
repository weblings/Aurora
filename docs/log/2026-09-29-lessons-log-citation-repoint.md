# docs/lessons/ + docs/log/: repoint citations to Id:/`[[id]]` (2026-09-29)

Aurora-0nu, the audit follow-on from the remaining-docs migration (see
`2026-09-29-remaining-docs-id-migration.md`): once the 17 archive/planning
files and [[implementation-plan]] had `Id:` lines, `docs/lessons/` and
`docs/log/` still cited several of them by bare path or old-style
markdown link.

Shipped: 6 edges converted in `docs/lessons/` (input.md, build-toolchain.md,
web-testing.md, processing.md) and 21 across 6 `docs/log/` build-history
entries (2026-09-13-hue-io-layer-followup.md, 2026-09-13-phase1-2-build-history.md,
2026-09-13-runtime-orchestrator-followup.md, 2026-09-15-webui-1stpass-build.md,
2026-09-23-fake-hue-bridge.md, 2026-09-28-mac-audio-grabber-lands.md). Two
of those log entries (2026-09-13-hue-io-layer-followup.md and
2026-09-13-runtime-orchestrator-followup.md) had an identical "Moved out of
X.md — X.md — the analysis keeps..." doubled mention, a copy-paste
artifact predating this pass -- deduped to a single `[[id]]` reference
while converting rather than left as two citations of the same target.

Deliberately left untouched: `docs/log/2026-09-28-docs-archive-and-assets-reorg.md`'s
~20 citation edges (the append-only record of the original archive reorg
-- rewriting a historical log entry's citations to ids that didn't exist
when it was written would be revising history, not fixing a live
reference) and `docs/log/INDEX.md`'s table rows (changelog labels, not
citations). Confirmed as the right call rather than something still owed.

`check-links.sh` + `check-lessons.sh` both clean.

Lesson extracted to `docs/lessons/architecture-process.md`: a historical
log entry keeps its pre-migration citations, don't retrofit `[[id]]` into
an append-only record.

Beads: Aurora-0nu (closed).
