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
