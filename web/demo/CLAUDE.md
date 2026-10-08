# web/demo — agent rules

## `processing.js`/`smoother.js`/`audioFeatures.js`/`colorModel.js` are copies, not authored here

These files are copied verbatim from `../../web-processing/` (the
hand-ported JS mirror of Aurora core's crop/mean/easing/audio-feature/color-model math) —
not an npm package, by deliberate choice. **Don't edit them in place here.**
If a bug or improvement is found in one of these copies:

1. Fix it in `../../web-processing/` instead.
2. Update that file's own `*.test.mjs` if the fix changes expected behavior,
   and check it still passes (e.g. `node audioFeatures.test.mjs`).
3. Recopy the fixed file(s) here.

See `../../CLAUDE.md` for the other side of this rule, and
[[browser-analysis]]/[[implementation-plan-phase-3]] for
why this is a copy instead of a shared package.

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
`descriptors.json`) and confirm `node vendor/webui/seams.test.mjs` passes.
`app.js`/`shell.js` are deliberately not vendored: `demo-boot.js` provides
the minimal app facade instead.
