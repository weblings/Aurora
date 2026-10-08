# Aurora-jwt7: demo Dashboard lost component padding after ifkn.2 (closed)

Id: jwt7-demo-reset-specificity

2026-10-08. A local demo check after the ifkn review used headless Chrome
over the DevTools protocol (scratch script, no repo tooling): load the page,
probe the Dashboard, click Audio then Video, toggle Pause, record console
errors, exceptions and failed or 4xx requests, and take screenshots.

## Found

- Functionally clean: both modes switch, Audio shows its 10 sliders with
  ranges, Stop is hidden (`canStop: false`), Pause flips to Resume and back
  through `GET /api/state`, the footer reads v1.1.0, no broken images, and no
  console errors or failed requests.
- Visual regression from Aurora-ifkn.2. Compared with the same run on
  `e1fcb9f` (pre-ifkn worktree), the pane lost all component padding. The
  `.db-port *` reset now sits in `demo-layout.css`, loaded last, and ties
  single-class component rules on specificity. See the layout-css lesson.
- The Audio "Zone mapping isn't available" message is unchanged from
  `e1fcb9f`, so it is not a regression.
- Demo Pause is cosmetic: the shim stores the flag, but nothing reaches the
  scene, so lights keep following the video while paused. Filed
  Aurora-calt (recommend a hook that holds the last colors).

## Fix

- `demo-layout.css`: `:where(.db-port) *` (zero specificity).
- `demo-layout.test.mjs` requires the `:where()` form and rejects a plain
  `.db-port *` reset (mutant check: restoring the old selector fails it).
- Re-run: styling matches `e1fcb9f` again, all checks above still clean.
  The demo suites and the vendor byte-identity test pass.

## Follow-up: Pause button clipped (Aurora-4jk4, closed)

The owner saw the top-right Pause button cut off on its right side. It was
measured in headless Chrome: button right edge 1473, `#screen-container`
clip edge 1468, pane edge 1484. The Dashboard top bar and pills overhang the
column by 21px, but `.db-port` (which is `#screen-container`) carried the
app body's `overflow-x: clip`, 5px short of that. The `demo-layout.css`
comment wrongly said the clip was at the pane edge.

- Fix: `#dashboard-pane` gets `overflow-x: hidden` (it is already the
  scroll container), and `.db-port` drops its clip. The layout test now
  requires the clip on the pane and none on the port.
- Re-measured: the button ends 11px inside the pane at 1484px wide, and at
  500px (narrow media rules) it ends at 459 of 485. Neither width overflows.
  All demo suites pass.
- Not a refactor regression in the app, which clips at the window edge.

## Follow-up: demo Pause freezes the lamps (Aurora-calt, closed)

The owner confirmed the demo's Pause changed nothing in either mode. The shim
stored the flag, but no hook reached the scene. The first fix read the jwcd
log's "released" as a reset and returned lamps to the model's authored white.
The owner then reported that real bulbs hold their last streamed color on
pause, so the demo now freezes instead:

- `demo-shim.js`: `PUT /api/state` fires `hooks.onPausedChanged(paused)`.
  `demo-boot.js` wires it to the new `setPaused()` in `main.js`.
- `main.js`: while paused, the render loop stops applying frames, so lamps
  keep the last frame's colors. The video and music keep playing, like a
  user's screen and audio do. The authored-color restore was removed.
- Only demo-owned files changed. Vendored copies stay byte-identical, and
  the seam and closure checks pass.
- Verified in headless Chrome with repeated screenshots of one lamp shade in
  each mode: 5 of 5 distinct while running, 1 of 5 while paused, distinct
  again after resume. No console or network errors. New shim test for the
  hook. All demo suites pass.

## Follow-up: owner checks and devstack (2026-10-08)

- Owner confirmed in Firefox: video and audio drive the lamps, Pause freezes
  on the last color, Resume continues, and the Pause button is no longer
  clipped. An earlier "video not rendering" report was VS Code's built-in
  browser, not the demo.
- After the Pause change, Firefox threw `doesn't provide an export named:
  'setPaused'`. The cause was a cached `main.js` next to a fresh
  `demo-boot.js`, because plain `http.server` sends no `Cache-Control`. A
  hard refresh fixed it. The web-testing caching lesson was extended, and
  Aurora-57ct was filed for devstack's viz server.
- Rebuilt `build/windows-app` (current core, including `canStop`), then
  `devstack.py up` with live capture. The first SSE frame was all zeros
  before capture warmed up, then real per-zone colors followed. The owner
  checked the viz and WebUI, then `down` left no state file.

## Follow-up: devstack viz server sends no-store (Aurora-57ct, closed)

The owner saw no cache trouble in the devstack. Pause goes through the WebUI,
which Aurora's own server already serves with `no-store`. The viz server only
serves `viz.html` and its modules, so the risk was limited to editing those
mid-session. `serve_viz`'s handler now adds `Cache-Control: no-store`
(3 lines), and the skill's hand-assembly step says so.

- Checked: `devstack.py _serve` alone returned `no-store` on `viz.html`,
  `viz.js`, `scene-core.js` and `TV_Room.glb`. A full `up` then served
  `viz.js` with `no-store`, the first frame arrived, and `down` left no
  state file.

Lesson: windows-env (a `CommandLine -match` kill from a shelled-out PowerShell matched and killed itself during the standalone check; exit 255 was that, not the server).
