# Browser checks

Playwright scripts that drive Aurora's web screens against the fake-Hue stack
(`tools/light-viz-relay/devstack.py`). A developer and gate tool: nothing in
the builds depends on it, so offline builds stay offline.

```sh
cd tools/browser-check
npm install            # playwright-core only; downloads no browser
npm run graph-editor   # brings the stack and the editor dev server up, runs, tears down
```

- `lib/browser.mjs` reuses a Chromium already in Playwright's cache
  (`PLAYWRIGHT_BROWSERS_PATH`, else the per-OS default) or `AURORA_BROWSER`.
  With none, it says to run `npx playwright-core install chromium-headless-shell`.
- `lib/stack.mjs` `withEditorStack(body)` runs `devstack.py up --input dummy`
  (needs a built app, see the relay README), starts the graph editor's Vite
  dev server proxied to it, and tears both down even when `body` throws.
- `AURORA_EDITOR=embedded` tests the editor built into the app binary instead of
  the dev server (the app must be built with `AURORA_ENABLE_GRAPH_EDITOR=ON`);
  `npm run graph-editor:slow` adds the 120 s test cap (about 2 minutes more).
- Checks assert and exit non-zero on the first failure; they remove the
  effects they create and restore the active effect.
- `checks/graph-editor-edit-loop.mjs`: E4's test, Keep, Revert, takeover, lost
  heartbeat, Save, Save and apply, Dashboard controls and their rendering in Tuning. The E6 gate extends it.
- `checks/graph-editor-gate.mjs` (`npm run graph-editor:gate`): the Sequence E gate, Aurora-pvxx.9 and .15: thumbnail change after a rewire, an Aurora restart (`devstack.py restart`), palette add, Save as new from a custom, and the replaced, draft_invalid and too_many_drafts preview states. It runs in a 1470 px window (laptop width). An embedded run needs the app rebuilt after editor changes.
