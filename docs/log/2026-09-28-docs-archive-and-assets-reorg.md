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

## Verification

- `python3 docs/check-links.sh` — green, all of `docs/` actually scanned now.
- `AGENTS.md`'s "Where things go" section updated with the four new rules
  (archive, WebUI docs, brand assets, per-section `Status:` lines) so the
  convention is discoverable, not just precedent.
