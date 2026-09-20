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
`../../docs/BrowserAnalysis.md`/`ImplementationPlan.md` (Phase 3) for
why this is a copy instead of a shared package.

## Check `../../docs/lessons/rendering-apis.md`/`rendering-internals.md` before touching the Three.js scene

All Aurora-family lessons-learned live in the core repo's `docs/lessons/`
tree, not per-repo — this repo doesn't get its own `LESSONS.md`. Real,
non-obvious findings from building `main.js`'s light rigs and the glTF room
scene are filed there (`rendering-apis.md`: Three.js/GLTFLoader/Blender
facts; `rendering-internals.md`: this project's own scene-design calls) —
check before re-deriving something already worked out once. Cite lessons by
headline/topic — every entry carries `Tags:`/`Applies-when:`, routed by the
matching `.claude/skills/` skill in core.
