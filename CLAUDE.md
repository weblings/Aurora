# Aurora core — agent rules

## Keep `web-processing/` in sync with the C++ it hand-ports

`web-processing/processing.js` and `web-processing/smoother.js` are hand-ported
JS mirrors of `core/Processing/src/ImageProcessing.cpp`'s crop/mean logic and
`core/Runtime/src/Smoother.cpp`'s easing formula, for the `Aurora-Demo-Web`
browser demo (see `docs/BrowserAnalysis.md`'s reuse-vs-reimplement finding
for why this is hand-ported rather than compiled to WASM). There is no
compiler or shared test runner enforcing the two stay identical — this file is
the enforcement mechanism.

- **Editing `ImageProcessing.cpp`'s `getSubImage`/`getDominantColor`/
  `Algorithms::mean`, or `Smoother.cpp`'s easing formula?** Check whether
  `web-processing/processing.js`/`smoother.js` needs the same change, and
  update `web-processing/processing.test.mjs`'s golden values if the C++
  test's expected values changed too (run `node web-processing/processing.test.mjs`
  to check — no build step, no npm install needed).
- **Editing anything in `web-processing/`?** Check it still matches the real
  behavior of the C++ files named in its own header comments before assuming
  a fix belongs only on the JS side.
- **`Aurora-Demo-Web` copies these two files verbatim** (not an npm package,
  by deliberate choice — see `docs/ImplementationPlan.md`'s Phase 3).
  After changing either file here, recopy it into `Aurora-Demo-Web` too, or
  the demo silently drifts from what this repo actually does.
