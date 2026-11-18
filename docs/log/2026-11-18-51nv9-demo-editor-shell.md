# Demo editor iframe shell and custom effects

Id: 51nv9-demo-editor-shell

`Aurora-51nv.9`. Edit graph opens the editor in a same-origin iframe in the Dashboard pane while the room keeps running. `vendor/build-editor.py` (also run by `fetch-engine.py`, `--editor-only` to skip the module) builds the editor into gitignored `web/demo/graph-editor/` and inserts `demo-editor-entry.js` before the bundle. That path supersedes the design's `vendor/graph-editor/` because the Dashboard probe and links are page-relative (`Aurora-51nv.1`). In the frame, `demo-editor-frame.js` forwards `/api/` fetch and EventSource to the parent through `window.auroraDemo`. `auroraCloseEditor` removes the frame and remounts the Dashboard. Custom effects, hidden and order persist in localStorage (`demo-effects.js`) and follow core's EffectsRoutes for title, hidden, move and delete. The demo facade sets `canApprove: true` so Delete shows.

## Verification
- Shim and frame tests, including a reload round trip over the same storage. Coordinator re-run of the web unit loop and closure check.
- Browser (agent): editor opens beside the room, back link remounts the Dashboard, a seeded custom effect survives reload and the editor trip, row menus act on it.
- Found: `Aurora-3m75`, the Dashboard shows Edit graph until the next render when the editor probe fails (also in the app).

## Lessons
- none
