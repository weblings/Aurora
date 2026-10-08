# Aurora-ifkn.3: Dashboard Stop gated on a canStop capability, screen re-vendored identical

Id: ifkn3-stop-capability

2026-10-08. Vendor 3 of the ifkn re-vendor sequence: the fork's hand-cut
Stop button is now an upstream capability. `GET /api/state` carries
`canStop` (core reports true; the demo shim answers false), and
`DashboardScreen` hides the Stop button entirely when false, Pause
unaffected. Absent flag reads as stoppable, so old binaries keep the
button. Pause decision: the demo SHOWS Pause -- the shim answers
`PUT /api/state` in-memory, so it works with no seam.

## Done

- Core: `{"canStop", true}` in `GET /api/state` (`PipelineRoutes.cpp`);
  `PipelineTests` exact-match body extended.
- web/ui: `canStop` field (default true), ingestion in `_loadAll` and the
  shell-beat `_onHeartbeatState`, button push gated on `!== false`.
- Shim: `canStop: false` in `GET /api/state`; `demo-shim.test.mjs`
  deepEqual extended.
- `vendor/webui/screens/DashboardScreen.js` byte-identical to web/ui
  (`cmp`); `CaptureSource.js` identical (+`putModeSwitch` the screen
  needs); `MacPermissionRecovery.js` newly vendored (import-free).
  `no-stop-button` seam deleted from MANIFEST + `seams.test.mjs`
  (replaced by byte-identity + canStop asserts); `MacPermissionRecovery`
  listed; `toggle-sync`, `no-output-connect`, `app-facade` notes updated.
- Toggle-sync seam relocated, not dropped: the identical screen wires no
  canvas<->list sync (upstream has no sibling consumer), so
  `demo-boot.js` mounts a `DemoDashboardScreen` subclass re-attaching both
  directions; vendor `ZoneCanvas`/`ZoneActiveToggle` keep their callbacks.
- `closure-check.mjs` clean against web/ui (20 reached, 21 listed, 2 dead).

## Verified

- Full web loop green (all `web/ui`, `web/demo`, `web-processing` suites);
  vendored screen imports clean in node; `demo-boot.js` syntax-checked.
- Mutants killed: gate forced open fails the Dashboard suite;
  `canStop:false` in C++ fails the kea exact-match case.
- `[PipelineRoutes]` 157/157; full `AuroraPipelineTests` 483/483.

## Open (bead stays claimed, not closed)

- Live browser pass: no headless browser in this env, so "demo shows no
  Stop / app shows Stop" is proven at unit level only (shim-false +
  gate tests + byte-identity). Needs a headed/headless screenshot pass.
- Follow-up filed: Aurora-fp6y (upstream canvas<->list sync is a latent
  desync in the app; demo-only fix here, upstream change needs an owner
  decision).
- Lesson notes: the "Sibling repos mix CRLF and LF" entry extended
  ([[lesson-build-toolchain]]); two new [[lesson-architecture-process]]
  entries (byte-identical re-vendor relocation, merged-export-vs-stale-DB
  round-trip).
