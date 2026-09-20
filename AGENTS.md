# web/demo — agent notes

Self-contained Three.js browser demo of the Aurora effect. No native
backend, no build step. Scoping lives in
`docs/BrowserAnalysis.md` and `ImplementationPlan.md` (Phase 3),
not here.

- `processing.js`/`smoother.js`/`audioFeatures.js`/`colorModel.js` are copies
  of `web-processing/` at the repo root — fix upstream and recopy, see `CLAUDE.md`.
- `vendor/webui/` is an intentional GitHub-Pages-targeted fork of `web/ui`,
  not a mirror — do not "sync" it (decision recorded in `Aurora-4jl`).
- Tests: `node <name>.test.mjs`, no build step.
- Tasks (`bd`) and lessons (`docs/lessons/`) live at the repo root.
