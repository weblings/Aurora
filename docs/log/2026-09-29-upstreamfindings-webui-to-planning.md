# UpstreamFindings.md and docs/WebUI/ moved into docs/planning/ (2026-09-29)

Owner-requested, one file each session apart. Both had been left at root
by the 2026-09-28 reorg pass on genre grounds ([[upstream-findings]]: "a
bug list for huenicorn, not a plan", held out "on genre grounds rather
than evidence, still a candidate"; `docs/WebUI/` given its own bucket in
`docs/README.md`, "kept together rather than at root") rather than
evidence of staleness -- flagged both times before proceeding, owner
confirmed the move anyway.

`docs/UpstreamFindings.md` -> `docs/planning/UpstreamFindings.md`: had no
`Id:` yet, so one was assigned while touching it (`upstream-findings`),
per `docs/README.md`'s "adopt opportunistically when next touched" rule.

`docs/WebUI/` -> `docs/planning/WebUI/`: both remaining files
([[webui-fixes]], [[webui-design-2-5-pass]]) already carried `Id:` from
Aurora-4ux, so citations via `[[id]]` needed no changes; only bare-path
citations needed fixing.

Fixed live citers: `docs/README.md` (folded the standalone `WebUI/`
bucket into `planning/`'s), root `AGENTS.md` and
`.claude/skills/web-ui-lessons/SKILL.md` (bare `docs/WebUI/` path --
neither is in `check-links.sh`'s scan scope, same blind spot Aurora-6wg
fixed once already), and `docs/lessons/navigation-flow.md` (converted its
bare-path citation to `[[webui-fixes]]`).

Left untouched by design, same as the existing `docs/log/*.md`
convention: `docs/log/*.md` entries and `docs/archive/
DocsAndLessonsPainPoints.md` (historical, not rewritten for later moves).
The resulting dead bare-filename citations in historical log entries
(`UpstreamFindings.md`, `docs/UpstreamFindings.md`) were added to
`check-links.sh`'s `GRANDFATHERED` set instead of editing the log prose.

`check-links.sh` + `check-lessons.sh` both clean; `docs/_ids.md`
regenerated.

Beads: Aurora-7pk (closed).
