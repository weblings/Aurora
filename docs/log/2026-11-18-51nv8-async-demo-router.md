# Demo shim router is async

Id: 51nv8-async-demo-router

`Aurora-51nv.8`. `createRouter`'s `route(method, path, rawBody)` in `web/demo/demo-shim.js` now returns `Promise<{status, json}>`, so engine-backed routes can await a Web Worker without stalling the room. Every existing route keeps its status and body. `installDemoShim` awaits it before building the `Response` and now also returns `route`, so the editor iframe (`Aurora-51nv.9`) can call the parent's router without fetch. Pass the path without its query string.

## Verification
- `demo-shim.test.mjs` converted to await, plus tests for the Promise return and the fetch glue (`/api/` routed, other URLs passed through, uninstall restores fetch).
- Coordinator re-run: web unit loop, closure check, `gen-demo-graph.py --check`. The demo Dashboard was loaded in a browser by the agent with no route errors.

## Lessons
- none
