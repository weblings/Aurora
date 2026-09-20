# Aurora core — agent notes

Core repo: shared `Contracts`, `Processing`, `Input`/`Output` interfaces,
`Runtime`, and `web-processing/` JS mirrors. Concrete plugins live in
`input/`, `output/`, `app/`, `web/` directories in this repo — keep that layout.

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure` (`BUILD_TESTS` defaults ON).
  Full-app builds: `cmake --preset <linux-app|windows-app>` (per-slice
  presets in `CMakePresets.json`); core tests alone via `cmake -S core`.
- `web-processing/`: `node web-processing/<name>.test.mjs`, no build step.
  See `CLAUDE.md` — it is the sync rule between the JS mirrors and the C++.
## Where things go

- Tasks (open, blocked, deferred): `bd` (`bd ready`, `bd list`), not markdown
  TODOs or checkboxes. Auto-export is debounced — run
  `bd export -o .beads/issues.jsonl` immediately before `git add`ing task state.
- Gotchas worth 30+ minutes: `docs/lessons/`, with `Tags:`/`Applies-when:`,
  routed by the matching `.claude/skills/` skill — check it before changing
  that area, file per `docs/lessons/README.md`.
- Milestone detail (closed or paused): dated file in `docs/log/` + `INDEX.md`
  row on close — every material fact, stated once and tightly; paused work logs
  state + resume pointer. Findings over narration.
- Planning docs: decisions, status, pointers only. No task lists, no build play-by-play.
- References: cite lessons by headline/topic, files by markdown link, external
  lessons by topic + directory (URLs live under Related directories).

## Related directories to be aware of

- This family, all in this repo: `input/linux`, `input/windows`,
  `output/hue`, `app/linux`, `app/windows`, `web/demo`, `web/ui` --
  core interfaces in `core/`, resolved by relative path. Per-slice notes in
  each directory's own `AGENTS.md`; tasks and lessons live here at the root.
- [RockyRoad](https://github.com/weblings/RockyRoad) — reference for Three.js/WebXR
  scenes, design tokens, and UI components (checked directly during WebUI design).
- [RockyRoadImport](https://github.com/weblings/RockyRoadImport) — import-pipeline
  reference (tab bar, forms page, layout tokens reused in WebUI).
- [huenicorn](https://gitlab.com/openjowelsofts/huenicorn) — the original
  Hue-entertainment reference (`Runtime::_update`, `ScreenWidget.js`); ported
  from, not depended on.

Cite reference lessons by topic name, never by path — layouts differ per machine.
