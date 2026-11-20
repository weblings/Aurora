# web/demo — agent rules

## Room colors come from the WASM engine, not JS copies

The room's colors run on `web/engine` (wrapEngine) inside `engine-worker.js`. The
module (`aurora-engine.mjs`/`.wasm`) is a CI artifact and never committed: run
`python web/demo/vendor/fetch-engine.py <dir>` to copy it into the gitignored
`vendor/engine/`. The old `processing.js`/`smoother.js`/`audioFeatures.js`/`colorModel.js`
copies are gone, so there is no sync rule. `builtin-graphs.js` is generated:
`python web/demo/gen-builtin-graphs.py` after a built-in graph change.

## Check `../../docs/lessons/rendering-apis.md` and `../../docs/lessons/rendering-internals.md` before touching the Three.js scene

All Aurora-family lessons-learned live in the core repo's `docs/lessons/`
tree, not per-repo — this directory doesn't keep its own lessons file. Real,
non-obvious findings from building `main.js`'s light rigs and the glTF room
scene are filed there (rendering-apis: Three.js/GLTFLoader/Blender facts;
rendering-internals: this project's own scene-design calls) —
check before re-deriving something already worked out once. Cite lessons by
headline/topic — every entry carries `Tags:`/`Applies-when:`, routed by the
matching `.claude/skills/` skill in core.

## `vendor/webui/` is vendored from `web/ui`, not authored here

The Dashboard port under `vendor/webui/` is a byte-identical copy of the
files listed in `vendor/webui/MANIFEST.json` — never hand-edit them. To
change anything the demo shows: fix it in `web/ui`, add a node test there if
behavior changed, then re-run `python3 web/demo/vendor/sync-webui.py` from
the repo root (copies verbatim, stamps `sourceCommit`, regenerates
`descriptors.json`, runs `closure-check.mjs`) and confirm
`node vendor/webui/seams.test.mjs` passes. If the closure check reports a
LEAK, add that module to `MANIFEST.json` and re-run.
`app.js`/`shell.js` are deliberately not vendored: `demo-boot.js` provides
the minimal app facade instead.

## `demo-graph.js` is generated from core's built-in graphs

Never hand-edit it. After a `controls` or node-param change in
`core/Runtime/src/Graph/`, run `python3 web/demo/gen-demo-graph.py` from the
repo root (after `gen-descriptors.py` if slider ranges changed) and commit the result.
