# Aurora core — agent notes

Core repo: shared `Contracts`, `Processing`, `Input`/`Output` interfaces,
`Runtime`, and `web-processing/` JS mirrors. Concrete plugins live in
sibling repos (`Aurora-Input-Linux`, `Aurora-Output-Hue`, ...), resolved
as sibling directories on disk — keep that layout.

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure` (`BUILD_TESTS` defaults ON).
- `web-processing/`: `node web-processing/<name>.test.mjs`, no build step.
  See `CLAUDE.md` — it is the sync rule between the JS mirrors and the C++.
## Where things go

- Tasks (open, blocked, deferred): `bd` (`bd ready`, `bd list`), not markdown
  TODOs or checkboxes. Auto-export is debounced — run
  `bd export -o .beads/issues.jsonl` immediately before `git add`ing task state.
- Gotchas worth 30+ minutes: `Analysis/lessons/`, with `Tags:`/`Applies-when:`,
  routed by the matching `.claude/skills/` skill — check it before changing
  that area, file per `Analysis/lessons/README.md`.
- Milestone detail (closed or paused): dated file in `Analysis/log/` + `INDEX.md`
  row on close — every material fact, stated once and tightly; paused work logs
  state + resume pointer. Findings over narration.
- Planning docs: decisions, status, pointers only. No task lists, no build play-by-play.
- References: cite lessons by headline/topic, files by markdown link, external
  lessons by topic + repo (URLs live under Related repos).

## Related repos to be aware of

- This family: `Aurora-Input-Linux`, `Aurora-Output-Hue`, `Aurora-App-Linux`,
  `Aurora-WebUI` — checked out alongside this repo, resolved by relative path.
- [RockyRoad](https://github.com/weblings/RockyRoad) — reference for Three.js/WebXR
  scenes, design tokens, and UI components (checked directly during WebUI design).
- [RockyRoadImport](https://github.com/weblings/RockyRoadImport) — import-pipeline
  reference (tab bar, forms page, layout tokens reused in WebUI).
- [huenicorn](https://gitlab.com/openjowelsofts/huenicorn) — the original
  Hue-entertainment reference (`Runtime::_update`, `ScreenWidget.js`); ported
  from, not depended on.

Cite reference lessons by topic name, never by path — layouts differ per machine.
