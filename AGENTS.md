# Aurora core — agent notes

Core repo: shared `Contracts`, `Processing`, `Input`/`Output` interfaces,
`Runtime`, and `web-processing/` JS mirrors. Concrete plugins live in
sibling repos (`Aurora-Input-Linux`, `Aurora-Output-Hue`, ...), resolved
as sibling directories on disk — keep that layout.

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure` (`BUILD_TESTS` defaults ON).
- `web-processing/`: `node web-processing/<name>.test.mjs`, no build step.
  See `CLAUDE.md` — it is the sync rule between the JS mirrors and the C++.
- Tasks live in `bd` here (`bd ready`, `bd list`), not markdown TODOs.
  Auto-export is debounced — run `bd export -o .beads/issues.jsonl`
  immediately before `git add`ing task state, never after batched writes
  without it.
- Gotchas live in `Analysis/lessons/` — check the matching
  `.claude/skills/` skill before changing that area, and file anything
  costing 30+ minutes per `Analysis/lessons/README.md`.
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
- When closing a milestone bead, move implementation detail to `Analysis/log/`
  (dated file, update `INDEX.md`): every material fact, stated once and tightly.
  Findings over narration. Paused (not closed) work gets the same treatment —
  log where it stands and what resumes it, so restarting never re-derives state.
  Planning docs keep decisions, status, pointers only.
