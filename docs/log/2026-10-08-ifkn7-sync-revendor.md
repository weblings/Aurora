# Aurora-ifkn.7 (open, built): sync script + full re-vendor, vendor byte-identical

Id: ifkn7-sync-revendor

2026-10-08. Vendor step 7 of the demo re-vendor (parent bead `Aurora-ifkn`,
child `Aurora-ifkn.7`). New `web/demo/vendor/sync-webui.py` copies every
MANIFEST modules/styles/icons path byte-verbatim from `web/ui` (or a sibling
Aurora-WebUI checkout arg), stamps `sourceCommit` from git, and regenerates
`descriptors.json`. Re-vendored with it: 34 files, all byte-identical
(`cmp`), closure clean (20 reached, 20 listed, 1 dead).

## MANIFEST + fork retirement

- Dropped `screens/ModeDeviceScreen.js` (dead since kea, imported by
  nothing) and the `mode-device-helpers` seam; `shell-css-scope`,
  `icon-paths`, `string-zone-ids`, `toggle-sync` notes retired with their
  upstreamed seams. Kept `no-output-connect` (dead-code rationale for
  `OutputConnectScreen`) and `app-facade` (boot not vendored, `shell.js`
  stays out) per the bead.
- `sourceCommit` stamped to the vendored HEAD (`a9c7aac`).
- The fork had drifted far: ~15 files changed (EntertainmentConfigSelect
  reloadError handling, ZonePatchQueue success/unreachable callbacks,
  Tooltips params, ta5 Tuning, page-split shell.css, dashboard media,
  module-relative icons) -- the verbatim copy *is* the fix for all of them.

## Demo side

- `demo-boot.js`: `DemoDashboardScreen` subclass removed, mounts the
  vendored `DashboardScreen` directly (upstream wires toggle-sync natively
  since `Aurora-ifkn.5`); unused vendor imports dropped.
- Shim now answers the two remaining fetched routes: `GET
  /api/linux/audio-status` (native `{followingDefault, sinkName}` shape from
  demo config) and `GET /api/hue/discover` (`{succeeded, bridges: []}` so
  OutputConnectScreen takes its entry-form fallthrough). `POST /api/stop`
  needs no route (Stop hidden by `canStop: false`). The audio-status poll
  stays dormant in the demo (shim reports no `linux` platform) -- the route
  is coverage, not live traffic.
- `seams.test.mjs` rewritten to the byte-identity form `Aurora-ifkn.8` will
  promote: per-file equality over MANIFEST plus cross-file pins the identity
  check cannot see (canStop gate + shim flag, direct screen mount, `.db-port`
  scope, module-relative icons, version footer, audio-sink wiring).
- Vendor dir untouched in layout (`web/demo/vendor`), so the gh-pages
  subtree push is unchanged.

## Verification

- Byte-identity: all 34 MANIFEST files `cmp`-clean; closure-check clean.
- `demo-shim.test.mjs` extended (audio-status shape, discover empty,
  descriptor param invariants from `Aurora-ifkn.6` intact).
- Full web loop green (27 suites); `AuroraControlDescriptorTests` green
  (75 assertions, earlier run, no C++ touched since).

## Open (bead stays claimed, not closed)

- Close is blocked on `Aurora-ifkn.3` (bd dependency): `.3`'s code is landed
  and vendored, but the bead stays open on its live-browser pass, which this
  env cannot run (no headless browser). Same standing caveat covers this
  bead's "local demo works in both modes" -- proven at unit level only
  (suites + byte-identity + closure + boot syntax check).
- `Aurora-ifkn.8`: CI wiring, doc updates, Pages publish.

## Surprises

- None lesson-worthy beyond the bead's own premise (drift magnitude). The
  sync script needed two path fixes (script dir vs `webui/` dir; ROOT
  depth) -- caught on first run by `FileNotFoundError`, not worth a lesson.
