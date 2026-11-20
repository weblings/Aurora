# WASM engine loadLive keeps node state

Id: 51nv13-loadlive-keeps-state

`Aurora-51nv.13`. `BrowserEngine::loadLive` built a new `PreviewEvaluator` on every call, so the demo room lost easing and audio drift state on each tuning change. Once a live graph exists, `loadLive` now reloads it with `PreviewEvaluator::reload`, which adopts state by node id as the app does for a Tuning edit. A doc that fails to load returns `cannot_load` and the previous graph keeps running. No export or JS API changed. Owner chose this over a JS slider debounce (hides the reset) or a new set-param export (differs from how the app retunes).

## Verification
- New `core/tests/BrowserEngineTests.cpp` (first native BrowserEngine test target): state survives a param change (matches an engine that ran the new doc throughout, differs from a fresh one), and a bad doc keeps the old graph. Both fail with the fix disabled.
- Coordinator re-run: full `ctest -j8` in `build/core-tests`, 516 passed.
- Gap: the browser module picks this up only from the next CI `aurora-engine-wasm` artifact (no local emsdk), so the demo's slider is unverified until then.

## Lessons
- none
