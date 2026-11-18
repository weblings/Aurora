# Demo room colors come from the WASM engine

Id: 51nv11-room-on-engine

`Aurora-51nv.11`. The room runs the built-in graphs on the WASM engine in a module Worker (`engine-worker.js` around `web/engine/engine.js`, `engine-host.js` with a generic `{id, call, args}` protocol plus `batch`, `engine-client.js`, `engine-room.js`). Each frame is one round trip: feed the canvas readback or the newest audio samples (only what the graph needs, `engine-feeds.js`), step, read `liveColors`. Tuning keys become graph params (`demo-tuning.js`), and `interpolation` is live for the first time. `#room-status` shows a loading line and an error line when the module cannot load. The module is a CI artifact copied by `vendor/fetch-engine.py` into gitignored `vendor/engine/`, and `wasm.yml` fails above 1 MB gzip. web/demo's four web-processing copies and their sync rule are gone. `web-processing/` stays with its tests, and `demo-graph.js` stays (still the catalog with no engine attached).

## Verification
- Node: protocol and client against a fake engine, feed selection, built-in graph drift guard, and `engine-real.test.mjs` against the real module (skips with none).
- Browser (coordinator, localhost, headless Chrome): engine ready about 194 ms and first colors about 225 ms after load. Video lights the room with per-zone colors that change about 3 ticks in 4. Music pulse (once `Aurora-51nv.10` added the switch route) changes colors on 192 of 203 ticks. Smoothing drag applies. Error line seen with the module unloadable.
- Engine cost is 0.06 ms per tick at 160 px (Node), readback about 0.1 ms. The about 45 ms round trip in headless Chrome is the main thread busy with software WebGL, not the engine.
- Gap: tuning reset state until `Aurora-51nv.13`, which the browser gets from the next CI module.

## Lessons
- [[lesson-agent-coordination]]: subagents cannot start a local server, so the coordinator runs it.
