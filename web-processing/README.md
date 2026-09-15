# web-processing

Hand-ported JS mirror of `core/Processing`'s crop/mean logic and
`core/Runtime/Smoother`'s easing formula, for the `Aurora-Demo-Web` browser
demo — kept in this repo, next to the C++ it mirrors, rather than in
`Aurora-Demo-Web` itself, so drift is easier to catch. See `../CLAUDE.md` for
the sync rule and `../Analysis/BrowserAnalysis.md` for why this is hand-ported
rather than compiled to WASM.

- `processing.js` — `subImageRect`/`meanColor`/`getDominantColor`/`composeFrame`.
- `smoother.js` — `Smoother`, RGB-space per-zone easing.
- `processing.test.mjs` — parity tests against the same golden values
  `core/tests/ProcessingTests.cpp` uses. No dependency: `node processing.test.mjs`.

No build step, no npm — `Aurora-Demo-Web` copies these two files directly.
