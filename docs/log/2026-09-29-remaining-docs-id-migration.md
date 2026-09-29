# Remaining archive/planning docs: `Id:`/`[[id]]` migration (2026-09-29)

Aurora-w4c, the mechanical follow-on left by the ImplementationPlan split
(see `2026-09-29-implementation-plan-split.md`): the 17 files left after
the [[implementation-plan]] split (Aurora-d8g) and the mac/WebUI
migrations (Aurora-le6/Aurora-4ux) -- AudioAnalysis, BrowserAnalysis,
DistributedArchitecturePlan, DocsAndLessonsPainPoints, FirstScan,
GUILaunchUX, HttpServerAnalysis, HueOutputAnalysis, LinuxCaptureAnalysis,
ModuleSplitPlan, OpenFormatsResearch, ProcessingAnalysis, RuntimeAnalysis,
StackComparison, WebDemoUIUpdate, WindowsInputAnalysis, and
`planning/FutureSteamOSSupport.md`. Unlike the ImplementationPlan/mac
splits, none of these needed content restructuring -- already
shipped/archived (or, for FutureSteamOSSupport.md, a small standalone
doc) -- so this was a flat tag-and-convert pass, delegated whole to a
subagent given the convention doc and the file/id list up front.

Shipped: `Id:` added to all 17 files; ~103 bare-path/backtick-filename/
markdown-link citations converted to `[[id]]` (higher than the ~70 rough
estimate from the original audit -- DocsAndLessonsPainPoints,
ModuleSplitPlan, and BrowserAnalysis had more resolvable cross-refs than
the initial count caught). Citations left untouched by design: anything
inside an unmodified `Status:` line (FirstScan.md's only doc citation
lived there), `docs/log/*.md` entries, bead ids, code paths, and
citations to docs with no `Id:` (root `docs/Building.md`/
`docs/UpstreamFindings.md`). `check-links.sh` + `check-lessons.sh` both
clean; `docs/_ids.md` regenerated with the 17 new ids.

Deliberately out of scope, follow-on: repointing the `docs/log/*.md`
citations that target these 17 files (38 found in the original audit, 20
concentrated in a single log entry) to `[[id]]` -- natural next pass now
that the ids exist, not part of this bead.

Beads: Aurora-w4c (closed).
