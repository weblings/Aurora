# web/demo — agent notes

Self-contained Three.js browser demo of the Aurora effect. No native
backend, no build step. Scoping lives in
`docs/BrowserAnalysis.md` and `ImplementationPlan.md` (Phase 3),
not here.

- `processing.js`/`smoother.js`/`audioFeatures.js`/`colorModel.js` are copies
  of `web-processing/` at the repo root — fix upstream and recopy, see `CLAUDE.md`.
- `vendor/webui/` is an intentional GitHub-Pages-targeted fork of `web/ui`,
  not a mirror — do not "sync" it (decision recorded in `Aurora-4jl`).
- `viz.html` + `viz.js` is the standalone light-viz page (Aurora-gj0.6): room
  rig on the shared `scene-core.js`, no WebUI/video/audio DOM. Its color
  source is `live-data-source.js` (EventSource against the relay below),
  the third provider implementation beside `video-source.js`/`audio-source.js`
  (contract documented on `main.js`'s `animate()`). Channel id -> `ROOM_ZONE_MAP`
  order is fixed (0/1/2/3 = front-left/front-right/back-left/back-right).
- Full live run: `tools/light-viz-relay/README.md` ("End-to-end viz run").
  Serve this dir (`python3 -m http.server`), open `viz.html`, send relay
  frames -- page stays dark until the first mappable frame, by design.
- Tests: `node <name>.test.mjs`, no build step.
- Tasks (`bd`) and lessons (`docs/lessons/`) live at the repo root.
