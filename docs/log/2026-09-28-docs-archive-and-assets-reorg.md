# Docs archive, WebUI doc relocation, brand-asset move (2026-09-28)

Prompted by a docs-organization review (`Aurora-0ki`): root `docs/` had grown
to 23 flat files mixing shipped analysis, superseded plans, and active
exploration with no separation, and `docs/README/` held build-input icon
assets under a name that reads as documentation. `docs/archive/` itself was
already scoped as "future" in the 2026-09-21 monorepo-reorg log entry
(Aurora-jkl) — this closes that gap rather than opening a new one.

## `docs/archive/` (shipped/superseded)

Moved, each already `Status: shipped` or `superseded` (added where missing):
`archive/FirstScan.md`, `archive/ModuleSplitPlan.md`, `archive/WebDemoUIUpdate.md`,
`archive/ProcessingAnalysis.md`, `archive/RuntimeAnalysis.md`, `archive/HueOutputAnalysis.md`,
`archive/LinuxCaptureAnalysis.md`, `archive/WindowsInputAnalysis.md`. `HttpServerAnalysis.md`
stays at root — it still feeds Phase 3 Milestone 2, in progress
(`Aurora-x7o`) — with a `Status:` line added to say so.

## `docs/WebUI/`

`WebUI/TooltipContent.md`/`WebUI/TooltipsAnalysis.md` moved in alongside the
WebUI design passes they belong with (were orphaned at root). Not shipped:
tooltip *plumbing* is live (`ControlDescriptor`, `web/ui/Tooltips.js`),
content wiring is still open (`Aurora-48x`) — `WebUI/TooltipsAnalysis.md`
now says so.

## `assets/brand/`

`docs/README/` held checked-in logo/icon masters consumed as real build
inputs by `app/linux|mac|windows/CMakeLists.txt` and the root `README.md`,
not documentation — moved to `assets/brand/`, all five live references and
the two mac icon-script header comments (`make_icns.sh`, `make_tray_icon.sh`)
updated. `docs/log/2026-09-27-mac-icon-fix.md` and
`docs/lessons/build-toolchain.md`'s existing entry keep the old `docs/README/`
path as-written — historical record of what happened, not live pointers.

## `check-links.sh` was silently checking nothing under `docs/`

Its base list was `('Analysis', '.claude/skills')` — the pre-rename name,
never updated by the 2026-09-21 rename commit despite that log entry
claiming "green after rename." `os.walk` on a nonexistent `Analysis/`
returns no files with no error, so the tool only ever checked
`.claude/skills/` and printed `links OK` regardless of `docs/` state. Fixed
to `'docs'`. Running it for real then surfaced two separate rot layers:
every cross-reference this move touched (fixed as part of the same pass —
`archive/` and `WebUI/`-prefixed now, ~30 files), and pre-existing dead
lesson refs unrelated to this move (`Analysis/lessons/*.md` leftovers from
the same 2026-09-21 rename, plus a few lesson mentions missing their
`lessons/` prefix) — fixed alongside since the checker was already open.

## `docs/archive/DocsAndLessonsPainPoints.md` → `docs/archive/`

Its own backlog is fully executed (items 1-9 by the 2026-09-21 monorepo
reorg, item 10 — the `docs/archive/` split — by this entry). Marked
`Status: historical` and moved; it's the record of why the current shape
exists, not a live backlog anymore.

## Second pass: five more docs → `docs/archive/`

`archive/AudioAnalysis.md`, `archive/BrowserAnalysis.md`, `archive/DistributedArchitecturePlan.md`,
`archive/OpenFormatsResearch.md`, `archive/StackComparison.md`.

A follow-up review first proposed grouping these five into a new
`docs/architecture/` — they cite each other and share one theme ("how far
could the architecture extend"). Checking actual edit history instead of
trusting their self-declared `Status:` lines killed that idea: every one of
them had its last *substantive* content edit within the project's first two
days (2026-09-13 to 09-15); nothing since but renames, link-hygiene passes,
and status-header bureaucracy — across two weeks and ~480 commits that
shipped the entire Mac platform, native audio on three OSes, and multiple
WebUI passes, none of which prompted a revisit. `archive/BrowserAnalysis.md`'s one
seemingly-live thread (`Aurora-f06`, an open bead) turned out to be equally
stale — created 2026-09-20, never updated since, still citing the
pre-rename `Analysis/` path in its own description. Self-reported `Status:`
lines that are never re-validated are exactly as frozen as the doc around
them; edit recency is the real signal.

All five moved to `docs/archive/` with corrected `Status:` lines naming
their actual last-touched date and what happened since. One exception noted
in-place rather than silently fixed: `archive/StackComparison.md`'s own premise is
to describe *current* architecture, and it's missing Mac entirely (last
updated 2026-09-14, before Mac existed) — archived as a known-stale
snapshot, not refreshed, since updating it is a separate, still-open task.

## Third pass: `docs/planning/`, and `archive/GUILaunchUX.md` → `docs/archive/`

Applying the same edit-history test to what was left at root: `Building.md`
(operational reference, correctly current, last touched 09-22) and
`UpstreamFindings.md` (a bug list for huenicorn, not a plan — frozen since
2026-09-13 by the same test, but held out of this batch on genre grounds
rather than evidence; still a candidate) aren't planning docs at all.
`archive/GUILaunchUX.md` is, and fails the test hard: last substantive edit
2026-09-21, still describing Windows tray as the only near-term item and
Linux/macOS as merely "researched," while Linux tray actually shipped
(09-23) and Mac shipped a tray icon plus reopen/second-launch fixes since —
none reflected. Moved to `docs/archive/` with a corrected `Status:` line.

`planning/ImplementationPlan.md` (the roadmap; per-phase `Status:` lines are already
its own currency mechanism) and `planning/FutureSteamOSSupport.md` (genuinely still
open/unstarted, not stale — nothing has happened in SteamOS-land to
contradict it, it's just unprioritized, a different failure mode than the
others) move to new `docs/planning/` instead: still-live, not yet decided,
distinct from both `docs/archive/`'s finished/abandoned work and root's
now much smaller "operational reference + narrow standalone" set
(`Building.md`, `HttpServerAnalysis.md`, `UpstreamFindings.md`).

Checked `HttpServerAnalysis.md`'s own justification for staying at root
(feeds `Aurora-x7o`, "in progress") along the way: that bead hasn't been
updated since 2026-09-20 and still names the pre-rename `Analysis/` path in
its description — same stale-bead pattern as `Aurora-f06` — yet the actual
`core/Network/src/HttpServer.cpp` was touched as late as 09-21 closing two
other beads. Left as-is; whether Milestone 2 is actually still moving isn't
something the repo alone can answer, and isn't this workstream's call to
make unilaterally.

Every relative link this pass touched was hand-verified for true path
correctness (not just checker leniency, which tolerates plenty a real
renderer wouldn't) — `planning/ImplementationPlan.md`'s and `planning/FutureSteamOSSupport.md`'s
own outbound `../`-style links needed an extra `../` for the new depth, and
`MacSupport.md`'s two line-anchored links to `archive/GUILaunchUX.md` needed both
the `archive/` prefix and their anchors recomputed (the new `Status:` block
shifted every line below it by 8).

`AGENTS.md`'s "Where things go" now also names `docs/planning/` and states
the edit-history-over-self-report rule explicitly, so the next session
doesn't have to rediscover it by hand.

## Verification

- `python3 docs/check-links.sh` — green, all of `docs/` actually scanned now.
- `AGENTS.md`'s "Where things go" section updated with the four new rules
  (archive, WebUI docs, brand assets, per-section `Status:` lines) so the
  convention is discoverable, not just precedent.
