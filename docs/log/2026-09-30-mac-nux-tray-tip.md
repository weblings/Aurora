# Mac NUX menu-bar tip screen (2026-09-30)

Closed: Aurora-qps.8. Branch `feat/MacSupportV2`. Replaces the dropped first-run notification (see `2026-09-30-mac-first-run-notification-spike.md`).

## Built

- `web/ui/screens/MacTrayTipScreen.js` + `styles/mac-tray-tip.css` (linked in `index.html`): title "Menu Bar", `icons/MacTray.gif` (398x218, max-width 398px, never upscaled), copy "Aurora lives in your menu bar" / "Click the Aurora icon for Launch UI or Stop." (user approved), shared nav footer. No discovery of its own; passes Welcome's promise to `onComplete`.
- `app.js`: `probeState()` returns `platform`; in the `needsOutputConnect` branch Welcome goes to the tip when `platform === 'mac'`. Back: tip -> Welcome, Output Connect -> tip (Mac) or Welcome (others). Back from later stages into Output Connect still passes no promise, so it re-runs discovery as before; Back into the tip reuses the already-started promise (can be stale; accepted).
- GIF moved `assets/MacTray.gif` -> `web/ui/icons/MacTray.gif` (single copy, user decision) so the embedded webroot carries it. `embed_webroot.py` was already binary-safe.
- `HttpLibServerImpl.hpp` `contentTypeFor()` gains `.gif` -> `image/gif`. The static mount (cpp-httplib's own table) already served `image/gif`; only the embedded path fell back to `application/octet-stream`.
- Tests: two `NetworkTests.cpp` cases (embedded GIF type + NUL/high bytes intact, static GIF type); `web/ui/styles/mac-tray-tip.test.mjs` (text assertions on screen, CSS, index link, app.js wiring).

## Verified

- `AuroraNetworkTests` passes (8 cases).
- `mac-app` build run `--fresh` with `AURORA_WEBUI_DIR` at the working tree (the build's baked source dir is a fetched copy, not the checkout): `/api/capabilities` platform `mac`, GIF served as `image/gif`, user walked the flow in a browser and approved the copy.

## Not verified

- `mac-tray-tip.test.mjs` never ran under node (not installed here); a Python port of its assertions passed.
- Embedded-webroot GIF serving in a rebuilt app (covered only by the unit test).
- Windows/Linux flow unchanged is by code reading, not a run.
- No `prefers-reduced-motion` fallback (a GIF cannot pause); out of scope.

## Findings

- A `build/mac-app` run serves the FetchContent copy of `web/ui`, not the checkout; use `AURORA_WEBUI_DIR=$PWD/web/ui` to see working-tree edits.
