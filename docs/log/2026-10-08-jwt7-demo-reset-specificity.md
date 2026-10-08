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
