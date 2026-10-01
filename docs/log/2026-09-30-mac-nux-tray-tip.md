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
- `mac-app` build run `--fresh` (launched with `AURORA_WEBUI_DIR` at the working tree, which turned out redundant: the baked `AURORA_WEBUI_SOURCE_DIR` already is this checkout's `web/ui`, so edits show without a rebuild): `/api/capabilities` platform `mac`, GIF served as `image/gif`, user walked the flow in a browser and approved the copy.

## Not verified

- `mac-tray-tip.test.mjs` never ran under node (not installed here); a Python port of its assertions passed.
- Embedded-webroot GIF serving in a rebuilt app (covered only by the unit test).
- Windows/Linux flow unchanged is by code reading, not a run.
- No `prefers-reduced-motion` fallback (a GIF cannot pause); out of scope.

## Findings

- Static serving (cpp-httplib's mount) and the embedded-file map have separate content-type tables; the mount already knew `.gif`, `contentTypeFor()` did not. A new asset type works in a dev run (static mount) and only breaks in a standalone/release build (embedded), so a dev-only check can't catch it. Filed in `docs/lessons/web-testing.md`.
- A mid-session claim that the build serves a FetchContent copy of `web/ui` was wrong (see Verified); corrected here and in `app/mac/README.md`.

## Also (same day)

- Aurora-qps epic closed; [[mac-tray-parity]] archived to `docs/archive/mac/`. Aurora-8mk and 8mk.10 dropped by the user (notarized bundle exists; publishing the zip stays a manual release step, CI signing out of scope since Actions aren't working). Status lines in [[mac-notarization]] and [[mac-video-capture]] corrected.
- README Mac section rewritten around a Mac release zip (macOS 27, Apple silicon, drag to Applications, menu-bar usage); stale lines fixed in `CONTRIBUTING.md`, `docs/Building.md`, and root `AGENTS.md`. The README describes a zip that is not yet attached to a GitHub Release; do not merge to the default branch before it is. The release itself needs a fresh `mac-release` build (the 2026-09-30 notarized zip predates this tip screen), which would also be the first real run of the GIF through the embedded webroot.
