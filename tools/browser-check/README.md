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
- `checks/graph-editor-converter.mjs` (`npm run graph-editor:converter`): a Float to Angle and an Angle to Float drop each insert the converter with two wires, one undo removes it, an Image on an Angle input is still refused. The app binary must be rebuilt after core catalog changes.
- `checks/graph-editor-add-menu.mjs` (`npm run graph-editor:add-menu`): the cascade Add node menu: open by `+` and Shift+A, search ranking, flyout keys, add a node, Esc and outside click. The app binary must be rebuilt after core catalog changes.
- `checks/graph-editor-top-bar.mjs` (`npm run graph-editor:top-bar`): the single top bar, the title menu's Name and effect list (arrow keys do not switch effects), the view menu and its minimap, a kept copy restoring silently and Revert to saved, `Edited since the test`, and the cannot-open shell rows without Retry. Its header lists which status cases are checked here, elsewhere or manual.
- `checks/graph-editor-kept-copy.mjs` (`npm run graph-editor:kept-copy`): silent restore of a kept copy (`data-unsaved` on the title button), Revert to saved, the newer-saved-version Modal (default focus, Escape, Load saved, centred buttons), unique `@new-` ids, the legacy `@empty` copy moving, and the first Save's slug id. `SHOTS=<dir>` saves the prompt, the menu and the naming dialog.
- `checks/graph-editor-tooltips.mjs` (`npm run graph-editor:tooltips`): hover help is Grille's Tooltip: no `title=` on nodes, ports, params or toolbar buttons; node title, port and Add node hovers show a tooltip in both themes; focus shows it and Esc hides it. `SHOTS=<dir>` saves the set.
- `checks/graph-editor-popover-toggle.mjs` (`npm run graph-editor:popover-toggle`): clicking an open menu's trigger closes it (Add node, View, title, Test caret), the Add node search field fits the menu, and the View, title and Test chevrons flip through Grille's `aria-expanded` rule.
- `checks/graph-editor-zones.mjs` (`npm run graph-editor:zones`): the Zones island: header with chevron, plain 14 px cells 8 per row, no resize button, collapse and expand kept across a reload, left of a side drawer. The narrow check covers it at 700x900, 1000x600 and 400x800.
- `checks/graph-editor-edit-loop.mjs`: E4's test, Revert, takeover, lost
  heartbeat, Save, Save and apply, Dashboard controls and their rendering in Tuning. The E6 gate extends it.
- `checks/graph-editor-drawers.mjs` (`npm run graph-editor:drawers`): the Details and Dashboard controls drawers: open, follow the selection, no on-node marks, label fields, reorder/remove, Delete in a drawer, Esc. `checks/graph-editor-context-menus.mjs` and `checks/graph-editor-delete.mjs` cover the menus, Shift+F10, the Delete key and its toast.
- `checks/graph-editor-test-outcome.mjs` (`npm run graph-editor:test-outcome`): a test ended from the Dashboard or by another effect is announced in the live region and is the first line of the Test caret menu, the button is drawn as at rest (no toast), the line clears on the next test, an edit, an undo to the saved graph and a Save, and a refused start is a toast. `SHOTS=<dir>` saves the set.
- `checks/graph-editor-undo-toast.mjs` (`npm run graph-editor:undo-toast`): announce-only messages (`Added <type>`) reach the live region and draw nothing; the three lossy toasts (Removed N Dashboard controls, Reverted to the saved version, Loaded the saved version) carry a real Undo button that works by mouse and keyboard, does not take focus, holds its timer while hovered and is spent by the next edit; a plain Saved toast has no Undo. `SHOTS=<dir>` saves each Undo toast.
- `checks/graph-editor-failed-save.mjs` (`npm run graph-editor:failed-save`): a Save or Save and apply the server refuses (route fulfilled with a 500) is the shell row `Couldn't save <title>: <reason>` with no Retry, action, dismiss or toast and Test still on; the next edit clears it, as does a successful Save; a network failure on Save sets no row. `SHOTS=<dir>` saves the row.
- `checks/graph-editor-back-link.mjs` (`npm run graph-editor:back-link`): the header's Dashboard link (href `/`, back arrow, no placeholder dot) and that `/` is the Dashboard.
- `checks/graph-editor-control-count.mjs` (`npm run graph-editor:control-count`): counts the editor's chrome controls (rendered buttons, inputs, selects, textareas, links outside canvas nodes) at 1470 px for `builtin.video` and `builtin.audio`, and fails above a stored ceiling that each cleanup stage lowers (9 and 9 after the Inspector went).
- `checks/graph-editor-gate.mjs` (`npm run graph-editor:gate`): the Sequence E gate, Aurora-pvxx.9 and .15: thumbnail change after a rewire, an Aurora restart (`devstack.py restart`), Add node menu add, Save as new from a custom, and the replaced, draft_invalid and too_many_drafts preview states. It runs in a 1470 px window (laptop width). An embedded run needs the app rebuilt after editor changes.
