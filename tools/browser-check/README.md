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
  It takes the highest cached `chromium_headless_shell-<revision>` whatever
  its layout (older `chrome-mac/headless_shell`, newer
  `chrome-headless-shell-mac-arm64/chrome-headless-shell`), so the revision
  need not match this package's Playwright version.
  With none, it says to run `npx playwright-core install chromium-headless-shell`.
- `lib/stack.mjs` `withEditorStack(body)` runs `devstack.py up --input dummy`
  (needs a built app, see the relay README), starts the graph editor's Vite
  dev server proxied to it, and tears both down even when `body` throws.
- `AURORA_VIZ_PORT=<port>` moves the stack's viz page off 8000 when something else holds it.
- `AURORA_EDITOR=embedded` tests the editor built into the app binary instead of
  the dev server (the app must be built with `AURORA_ENABLE_GRAPH_EDITOR=ON`);
  `npm run graph-editor:slow` adds the 120 s test cap (about 2 minutes more).
- Checks assert and exit non-zero on the first failure; they remove the
  effects they create and restore the active effect.
- `checks/graph-editor-title-menu.mjs` (`npm run graph-editor:title-menu`): the title menu's open, Esc, outside click, pane drag, focus return and Delete/Backspace handling. `lib/editorMenu.mjs` has the helpers the other checks use to pick Save, Save as new and Save and apply.
- `checks/graph-editor-top-bar.mjs` (`npm run graph-editor:top-bar`): the single top bar, the title menu's Name and effect list (arrow keys do not switch effects), the view menu and its minimap, the Restore/Discard banner, `Edited since the test`, and the cannot-open banner with Retry. Its header lists which status cases are checked here, elsewhere or manual.
- `checks/graph-editor-edit-loop.mjs`: E4's test, Revert, takeover, lost
  heartbeat, Save, Save and apply, Dashboard controls and their rendering in Tuning. The E6 gate extends it.
- `checks/graph-editor-back-link.mjs` (`npm run graph-editor:back-link`): the header's Dashboard link (href `/`, back arrow, no placeholder dot) and that `/` is the Dashboard.
- `checks/graph-editor-control-count.mjs` (`npm run graph-editor:control-count`): counts the editor's chrome controls (rendered buttons, inputs, selects, textareas, links outside canvas nodes) at 1470 px for `builtin.video` and `builtin.audio`, and fails above a stored ceiling that each cleanup stage lowers.
- `checks/graph-editor-gate.mjs` (`npm run graph-editor:gate`): the Sequence E gate, Aurora-pvxx.9 and .15: thumbnail change after a rewire, an Aurora restart (`devstack.py restart`), palette add, Save as new from a custom, and the replaced, draft_invalid and too_many_drafts preview states. It runs in a 1470 px window (laptop width). An embedded run needs the app rebuilt after editor changes.
