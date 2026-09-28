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

## Verification

- `python3 docs/check-links.sh` — green, all of `docs/` actually scanned now.
- `AGENTS.md`'s "Where things go" section updated with the four new rules
  (archive, WebUI docs, brand assets, per-section `Status:` lines) so the
  convention is discoverable, not just precedent.
