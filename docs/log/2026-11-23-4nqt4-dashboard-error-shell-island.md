# Dashboard error shell becomes a React island

Id: 4nqt4-dashboard-error-shell-island

`Aurora-4nqt.4` (closed, P3, 1.2.1). The Dashboard's banner and "Aurora has stopped" takeover are drawn by the graph editor's `ErrorShell`, mounted through `islands.js`. `shell.js` keeps the heartbeat, takeover state and polling and pushes props.

- The bead said to extract the snapshot and pulse state from the editor App into a hook. `ErrorShell` already owned that state and fetches nothing, so no hook was needed.
- `window.auroraIslands.mountErrorShell(el, props)` mounts once into `#shell-island` and returns `{ update, unmount }`. The collapse and pulse state live in React, so the island is fed new props and never remounted.
- `index.html` has `#shell-island` (`display: contents`, so the sticky banner slot still sticks against the page) in place of the two slots. `ErrorShell` renders `#shell-banner-slot` and `#shell-overlay-slot` inside it. `#shell-announcer` stays outside.
- `shell.js` props: host state, platform, conditions, the route-gated errors, pairings, the light test, `unreachable` and `hasReplied` (its baseline flag). Handlers and `onAnnounce` are built once, since a new `onAnnounce` would re-announce on each render.
- Retired: `shellPatch.js` and its test, the `shell.js` timers, click handler and `_act`, and `renderRow`, `bannerRows` and `bannerHtml` in `shellRows.js`. The markup parity test is gone. `ErrorShell.test.tsx` now asserts words, ids, actions, dismiss counts and marks per case. `shell.test.mjs` reads the props through an island double.
- The `.shell-grille-row` rules moved from `editor.css` to `shell.css`. The main page does not load `editor.css`, so without this each row had a second border and padding.
- The permission and local-network rows stay shared HTML inside the island. They move with the NUX screens (`Aurora-4nqt.8`).
- Look: Grille's MessageRow and Button on the Dashboard, as in the editor. The owner chose not to review it.

## Verification
- `tsc --noEmit` clean, `vitest run` 377 passed, every `web/ui` node test passes, the demo vendor sync and closure check pass, and the editor and islands Vite build succeeds.
- The Release app was rebuilt and the browser checks `dashboard-shell` and `shell-cap` pass against it, on viz port 8100 because another process held 8000. `dashboard-shell` needed three selectors moved from `.shell-mark-info` to `.ui-message-row-mark` in open rows, the same change the editor check got in `Aurora-4nqt.2`.
- Not run: a look at the Dashboard shell by the owner (waived), and the embedded editor variant.

## Lessons
- [[lesson-components]]: an island that keeps its own state needs a store and `update`, not a remount per render.
- [[lesson-layout-css]]: a rule an island needs cannot live in `editor.css`, the main page does not load it.
