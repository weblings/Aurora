# Per-slice AGENTS.md folded into READMEs (2026-09-30)

Closed: Aurora-cv1. Branch `feat/MacSupportV2`.

## Why

The nine per-slice `AGENTS.md` files were pre-monorepo artifacts: the 2026-09-21 reorg kept them ("local notes stay local") rather than designing them. Seven of nine were ~10-line stubs duplicating the sibling README (build commands, "tasks and lessons live at the repo root", which root `AGENTS.md` already says). The Mac slices had neither file. Unique content lived only in `tools/*` and `web/demo`.

## Done

- Deleted `AGENTS.md` from `app/{linux,windows}`, `input/{linux,windows}`, `output/hue`, `web/{ui,demo}`, `tools/{fake-hue-bridge,light-viz-relay}`. Root `AGENTS.md` stays.
- Folded unique content into READMEs: "Keeping in sync" sections in both `tools/` READMEs (port defaults, payload shapes, gamma/crop math must track C++, run `check.py`, no CMake); `web/demo` README gains the copied-from-`web-processing` rule, the `vendor/webui` fork rule, the `viz.html` provider notes, and the node-test command. The stubs' build lines were already in the READMEs or `docs/Building.md`.
- New `app/mac/README.md` and `input/mac/README.md`.
- `web/ui/README.md` Status was wrong ("No screens exist yet"); rewritten, and `app/mac` added to its consumers.
- References updated: root `AGENTS.md` and `CLAUDE.md`, `CONTRIBUTING.md`, one citation in `docs/planning/NodeGraphPipeline.md`, one in `docs/log/2026-09-25-fakehue-gj07.md`. Link check passes.

## Not changed

- `web/demo/CLAUDE.md` stays (the one nested file Claude Code is known to auto-load). It overlaps the README's copy rule; left as is.
- Other slice READMEs still carry stale status text (e.g. `input/windows` says `WindowsGrabber` is "not started"); out of scope.
- Whether Claude Code auto-loads nested `AGENTS.md` was not verified.
