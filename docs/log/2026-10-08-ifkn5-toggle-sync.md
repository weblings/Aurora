# Aurora-ifkn.5 closed: toggle-sync callbacks upstream, Dashboard wires both zone views

Id: ifkn5-toggle-sync

2026-10-08. Vendor step 5 of the demo re-vendor (parent bead `Aurora-ifkn`,
child `Aurora-ifkn.5`). Upstreamed the fork's `toggle-sync` seam:
`ZoneActiveToggleList` takes an optional `onChange` (fires with the flipped
zone after the queue write; absent by default so pre-existing callers behave
exactly as before), and `ZoneCanvas` takes an optional `onActiveChange` plus a
`refreshActive()` that re-syncs the embedded Active bool from the live zone
objects without a full re-render (safe mid-interaction; a no-op when no box is
mounted). Both callbacks are plain optional fields (`?.` at the call site),
and both components keep their full `ZonePatchQueue` wiring (`onError`,
`onSuccess`, `onUnreachable`) -- unlike the fork, which passes only
`onError`.

## The Dashboard needs the sync itself

The bead asked whether `web/ui` needs the sync or just tolerates the
callbacks. It needs it: the app Dashboard mounts both views over the same
shared zone objects (canvas with `renderActive: true` plus the Bridge
`ZoneActiveToggleList`), so a flip on one side left the other stale -- the
latent app-side desync filed as `Aurora-fp6y` during `Aurora-ifkn.3`.
`DashboardScreen` now wires both directions natively (canvas flip re-renders
the Bridge list; Bridge flip calls `zoneCanvas?.refreshActive()`), routed
through thin methods (`_onZoneCanvasActiveChange`,
`_onBridgeZoneToggle`) so the contract is unit-testable without a DOM.

## Vendor + demo fallout (kept green for Aurora-ifkn.7)

- `vendor/webui/screens/DashboardScreen.js` re-copied byte-identical (`cmp`);
  the `seams.test.mjs` byte-identity assert broke the moment `web/ui` moved,
  same pattern as `Aurora-ifkn.3`.
- `MANIFEST.json` toggle-sync note updated (screen wires both natively now).
- `demo-boot.js`'s `DemoDashboardScreen` re-attach is redundant but harmless
  (same wiring twice); comment updated, removal left to `Aurora-ifkn.7`.
- Vendor `ZoneActiveToggle.js`/`ZoneCanvas.js` keep their fork forms (inline
  lookup, `onError`-only queues, DEMO SEAM comments) until the scripted
  re-vendor; behavior matches upstream on the seam paths.

## Verification

- Extended `web/ui/ZoneActiveToggle.test.mjs` (onChange fires with zone;
  absent-callback flip persists, no throw). New `web/ui/ZoneCanvas.test.mjs`
  (re-sync, `zones[0]` fallback, null-box no-op, sibling-flip pickup via
  prototype-called `refreshActive`). Extended
  `web/ui/screens/DashboardScreen.test.mjs` (pair methods: list re-render,
  canvas refresh, null-canvas no-throw).
- Negative evidence: `git show HEAD:...ZoneActiveToggle.js | grep -c onChange`
  is 0, so the new onChange assertions fail pre-change by construction; the
  `ZoneCanvas` flip-notify line needs a real DOM to drive end to end (no
  jsdom in this repo), so it is covered by inspection plus the app/demo
  runtime -- live browser pass still open, same standing caveat as
  `Aurora-ifkn.3`.
- Full web loop green (27 suites: `web/ui` incl. `screens/`, `web/ui/styles`,
  `web/demo` incl. vendor seams, `web-processing`); `closure-check.mjs`
  against `web/ui` clean.

## Surprises

- `DashboardScreen.js` is LF while sibling `web/ui` files are CRLF in this
  checkout -- scripted edits must match each file's own endings.
- New lesson in [[lesson-webui-testing]] (thin screen methods for
  DOM-needing component wiring); no component-behavior lesson (the
  callbacks-only-additive shape needed none).
