# web-processing

No longer used by the web demo: since Aurora-51nv.11 the demo runs the graph engine
compiled to WASM (`web/engine/`). Kept with its parity tests. The text below is historical.

Hand-ported JS mirror of `core/Processing`'s crop/mean logic and
`core/Runtime/Smoother`'s easing formula, for the `Aurora-Demo-Web` browser
demo — kept in this repo, next to the C++ it mirrors, rather than in
`Aurora-Demo-Web` itself, so drift is easier to catch. See `../CLAUDE.md` for
the sync rule and [[browser-analysis]] for why this is hand-ported
rather than compiled to WASM.

- `processing.js` — `subImageRect`/`meanColor`/`getDominantColor`/`composeFrame`.
- `smoother.js` — `Smoother`, RGB-space per-zone easing.
- `processing.test.mjs` — parity tests against the same golden values
  `core/tests/ProcessingTests.cpp` uses. No dependency: `node processing.test.mjs`.

No build step, no npm — `Aurora-Demo-Web` copies these two files directly.
