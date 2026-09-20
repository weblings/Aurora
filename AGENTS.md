# web/demo — agent notes

Self-contained Three.js browser demo of the Aurora effect. No native
backend, no build step. Scoping lives in
`Analysis/BrowserAnalysis.md` and `ImplementationPlan.md` (Phase 3),
not here.

- `processing.js`/`smoother.js`/`audioFeatures.js`/`colorModel.js` are copies
  of `web-processing/` at the repo root — fix upstream and recopy, see `CLAUDE.md`.
- Tests: `node <name>.test.mjs`, no build step.
- Tasks (`bd`) and lessons (`Analysis/lessons/`) live at the repo root.
