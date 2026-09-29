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
`archive/LinuxCaptureAnalysis.md`, `archive/WindowsInputAnalysis.md`.
`archive/HttpServerAnalysis.md` moved too, later in this same session — see
the fourth pass below.

## `docs/WebUI/`

[[webui-tooltip-content]]/[[webui-tooltips-analysis]] moved in alongside the
WebUI design passes they belong with (were orphaned at root). Not shipped:
tooltip *plumbing* is live (`ControlDescriptor`, `web/ui/Tooltips.js`),
content wiring is still open (`Aurora-48x`) — [[webui-tooltips-analysis]]
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
(`Building.md`, `archive/HttpServerAnalysis.md`, `UpstreamFindings.md`).

Checked `archive/HttpServerAnalysis.md`'s own justification for staying at root
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
MacSupport.md's two line-anchored links to `archive/GUILaunchUX.md` needed both
the `archive/` prefix and their anchors recomputed (the new `Status:` block
shifted every line below it by 8).

`AGENTS.md`'s "Where things go" now also names `docs/planning/` and states
the edit-history-over-self-report rule explicitly, so the next session
doesn't have to rediscover it by hand.

## Fourth pass: `archive/HttpServerAnalysis.md` → `docs/archive/`

Held back from the earlier passes since real, currently-shipping work
(`web/ui/screens/`, `SettingsRoutes`/`ZoneRoutes`/`PairingRoutes`, commits as
recent as today) seemed to justify keeping it live against an "in progress"
`Aurora-x7o`. Owner correction: `Aurora-x7o`'s "Phase 3 Milestone 2" framing
was agent-proposed scaffolding from an earlier session, not something the
project owner actually committed to — so the doc's justification for
staying at root doesn't hold regardless of how much of the underlying
WebUI work is real (most of it is). Archived with a `Status:` line
separating the two facts: the tracking bead isn't authoritative, but the
analysis still correctly fed the server skeleton that's actually built.

## Fifth pass: `docs/WebUI/` split, and closing `Aurora-x7o`/`Aurora-48x`

Checked whether `docs/WebUI/` itself needed the same archive/keep split
applied to root — it did, and it wasn't uniform. Per file, against the
actual code and beads:

- [[webui-design-1st-pass]] — every section already self-declared `Status:
  shipped 2026-09-15` or `standing`. Straightforward archive.
- [[webui-design-2nd-pass]] — both live sections said `in progress
  (Aurora-x7o)`, but the work is real: `web/ui/AccordionSection.js` is
  wired into `DashboardScreen.js`/`shell.js` (the accordion Dashboard),
  and `WelcomeScreen.js` (the NUX redesign) shipped 2026-09-20. Archived
  with a `Status:` line saying not to trust the inline ones below it.
- [[webui-tooltip-content]]/[[webui-tooltips-analysis]] — both still claimed content
  wiring was open, tracked in `Aurora-48x`. Checked: zero literal `'Test'`
  placeholders remain anywhere in `web/ui`, and a 2026-09-18 commit ("Wire
  approved tooltip copy") predates the bead's own 2026-09-20 creation date
  — the bead was stale for work already finished before it existed.
  Archived both with corrected `Status:` lines.
- [[webui-fixes]] and [[webui-design-2-5-pass]] — left in `WebUI/` as
  genuinely active: `bd list -l webui` shows 20 real issues (14 open, 1
  in-progress sub-task, live bugs like `Aurora-m2c`/`Aurora-mqi`). Worth
  flagging separately: the 6 "Diff 2.5Pass vs 2_Pass" beads underneath it
  (`Aurora-1dl`/`2yf`/`typ`/`wey`/`56v`/`73v`) share `Aurora-x7o`/
  `Aurora-48x`'s exact staleness signature (created 09-20, never updated)
  — different failure mode though: nothing has shipped to contradict them,
  they're deprioritized, not disproven. Left open, not closed, since that's
  a real prioritization call, not a docs-organization one.

Owner correction that triggered this pass: `Aurora-x7o`'s "Phase 3
Milestone 2" framing, and `Aurora-48x`'s tooltip-wiring framing, were both
agent-proposed tracking the owner never actually signed onto — closed both.
The live MJPEG/SSE preview streaming `Aurora-x7o` named (the one genuinely
unbuilt piece of the four it covered) isn't being re-tracked as a new bead;
if it's wanted later, that's a fresh decision, not a carry-forward of this
one's framing.

## Verification

- `python3 docs/check-links.sh` — green, all of `docs/` actually scanned now.
- `AGENTS.md`'s "Where things go" section updated with the four new rules
  (archive, WebUI docs, brand assets, per-section `Status:` lines) so the
  convention is discoverable, not just precedent.
