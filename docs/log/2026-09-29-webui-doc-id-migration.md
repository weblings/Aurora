# WebUI docs: second `Id:`/`[[id]]` migration pass (2026-09-29)

Second real-content validation of Aurora-lmn's mechanism (Aurora-4ux),
deliberately a different shape from the mac split: 6 sequential
build-pass docs (webui-fixes, webui-design-2-5-pass, webui-design-1st-pass,
webui-design-2nd-pass, webui-tooltip-content, webui-tooltips-analysis)
with heavy cross-referencing concentrated in one file, not a topic split
-- no restructuring needed, all already-shipped content.

Shipped:
- Id: assigned to all 6 files; 18 internal cross-citations converted
  from bare path/filename to `[[id]]` (7 of them in WebUI_Design_2ndPass.md
  alone, citing WebUI_Fixes.md's own pass sections).
- 7 docs/log/*.md citations converted too (6 in the archive-reorg log
  entry itself, 1 in the original 1stPass build log).
- Regression test: deliberately typo'd [[webui-design-1st-pass]] (both
  occurrences) in WebUI_Fixes.md, confirmed check-links.sh failed with
  accurate line-level DEAD entries, restored and re-verified clean --
  confirms the resolver actually enforces, not just passes by
  construction.

Not converted (deliberately, Phase 3's deferred scope): remaining WebUI
mentions in docs/lessons/*, docs/planning/ImplementationPlan.md,
web/ui/AGENTS.md/README.md -- none dead today, out of scope for this
pass.

Beads: Aurora-4ux (epic, closed), 4ux.1-.3.
