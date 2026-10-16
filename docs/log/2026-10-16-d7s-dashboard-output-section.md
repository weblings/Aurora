# Dashboard Output section (Aurora-d7s)

Id: d7s-dashboard-output-section

Closed 2026-10-16. Item 10 of [[home-assistant-output]]'s prep work, following the setup-flow table in [[ha-prep-4y9]].

## Done

- `OUTPUT_SECTIONS` table in `web/ui/screens/DashboardScreen.js`, one entry (`hue`): `title`, `load(screen)` (per full load), `loadZones(screen)` (per zone refresh), `render(screen, content)`. `hasHue` and `_renderBridgeContent` are gone. The screen picks the first `capabilities.outputs` name the table knows, as `app.js` does.
- Hue keeps its title ("Bridge"), markup and "Change bridge" button, so the Dashboard looks the same. An output absent from the table gets the title "Output" and "Not available in this build."
- Section hook renamed `.db-accordion-bridge` to `.db-accordion-output` (no other references). `web/demo/vendor/webui` re-vendored via `sync-webui.py`. The demo shim already reports `outputs: ['hue']`.

## Verification

- `DashboardScreen.test.mjs` gained cases for the Hue entry and the unknown-output fallback. All `web/ui` and `web/demo` node tests pass.

## Left open

- No generic "Change output" action: the Hue button fills that slot until Aurora-4zr.7.
- The brightness floor control (Aurora-pngj, [[6v36-brightness-floor]]) is not added. It belongs in the `render` of an output that declares "brightness 0 means off", which Hue does not.
- Not checked in a browser.

## Lessons

- None.
