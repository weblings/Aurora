# Aurora-Demo-Web — agent rules

## `processing.js`/`smoother.js` are copies, not authored here

These two files are copied verbatim from `../Aurora/web-processing/` (the
hand-ported JS mirror of Aurora core's crop/mean and easing math) — not an
npm package, by deliberate choice. **Don't edit them in place here.** If a
bug or improvement is found in this copy:

1. Fix it in `../Aurora/web-processing/` instead.
2. Update `../Aurora/web-processing/processing.test.mjs` if the fix changes
   expected behavior, and check it still passes (`node processing.test.mjs`).
3. Recopy the fixed file(s) here.

See `../Aurora/CLAUDE.md` for the other side of this rule, and
`../Aurora/Analysis/BrowserAnalysis.md`/`ImplementationPlan.md` (Phase 3) for
why this is a copy instead of a shared package.

## Check `../Aurora/Analysis/lessons/engineering-hygiene.md` before touching the Three.js light rigs

All Aurora-family lessons-learned live in the core repo's `Analysis/lessons/`
tree, not per-repo — this repo doesn't get its own `LESSONS.md`. Real,
non-obvious `RectAreaLight`/falloff/perspective findings from building
`main.js`'s point and rect-area rigs are filed there — check it before
re-deriving light-tuning behavior that's already been worked out once.
