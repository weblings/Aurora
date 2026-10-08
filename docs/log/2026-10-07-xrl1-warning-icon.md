# Aurora-xrl1: vector warning icon replaces bold ⚠ (closed)

Id: xrl1-warning-icon

2026-10-07. Follow-on to Aurora-x1lh's error-shell visual polish, which
bolded the `⚠` character via a `-webkit-text-stroke` hack (a symbol-fallback
font's bold face barely differs from regular at 13px). Replaced the
character entirely with a real vector triangle.

## Done

- `web/ui/icons/warning.svg` added: cropped from an uncropped Inkscape
  A4-page export the owner dropped at the repo root (`assets/Warning.svg`,
  meant for `app/*` build-input icons per `AGENTS.md`, not a WebUI asset) --
  re-cropped to a tight viewBox and the triangle's hardcoded `stroke:#000000`
  changed to `currentColor`.
- `.warn-glyph` (forms.css) switched from the text-stroke hack to the same
  masking technique `.accordion-chevron` already uses for `chevron-down.svg`
  (`background-color: currentColor` + `mask-image: url(icons/warning.svg)`)
  -- every call site's markup changed from `<strong class="warn-glyph">⚠
  </strong>` to an empty `<span class="warn-glyph" aria-hidden="true">
  </span>`: `MacPermissionRecovery.js` (4 sites), `shell.js`'s per-row
  banner, `TuningFields.js`, `DashboardScreen.js`,
  `EntertainmentZoneSelectScreen.js`, `OutputConnectScreen.js` (2),
  `ZoneMappingScreen.js` (2).
- The collapsed "N problems" summary button (`shell.js`) also switched to
  the vector icon -- it predated x1lh's bolding and had been carrying the
  bare `⚠` character this whole time, missed by that pass.
- `messages.test.mjs`'s regression guard (added by x1lh) updated to reject
  any bare `⚠` in a `status-text-error` line, bolded or not, instead of just
  the unbolded form.
- `web/demo/vendor/webui/MANIFEST.json`'s `icons` list gained
  `icons/warning.svg`; `sync-webui.py` re-run (ran three times total this
  session, once per CSS iteration below) to keep the vendor copy
  byte-identical.
- Owner edited the triangle's own artwork directly in Inkscape after the
  CSS-sizing back-and-forth below settled (thinner outline, 2.65px stroke
  down to 1.89px, and a slightly larger triangle within the same canvas) --
  exported back over the original uncropped `assets/Warning.svg`, not the
  cropped `web/ui/icons/warning.svg`. Re-cropped into the real icon file
  (new tight viewBox `0 0 34 29`) and `assets/Warning.svg` removed again.
- Icon sizing iterated live against the real running app, twice reverted:
  started at 14x12px/`vertical-align: -1px` (matching the old glyph's rough
  footprint); recalculated against Inter's cap-height at 13px (~9.5px) and
  shrunk to 12x10px -- looked right on paper; owner's own screenshot showed
  the one capital letter lined up fine but the icon read as floating above
  the mostly-lowercase rest of the line, so shrunk further to 10x8px sized
  to x-height instead -- owner called that worse and reverted. Settled back
  on the original 14x12px/-1px as "good enough." Net: neither font-metric
  calculation (cap-height nor x-height) produced a visually better result
  than the simpler starting values; see new lesson below.

## Verification

- `node messages.test.mjs`, `node shell.test.mjs`, and the rest of
  `web/ui`'s `*.test.mjs` suite green throughout.
- `web/demo/vendor/webui/seams.test.mjs` green after each re-sync (byte-
  identity + seam checks).
- Checked live against the real running Windows app via
  `devstack.py up --banner-errors 2`, then two more dev-injected errors
  added directly through `POST /api/dev/errors` (sources `dev-wrap-2`/
  `dev-wrap-3`) to get 2-line and 3-line wrapped rows; `AURORA_WEBUI_SOURCE_DIR`
  resolves to the real `web/ui` checkout with `Cache-Control: no-store` on
  every response, so each CSS/SVG edit was live on refresh, no rebuild.
- A throwaway standalone harness page (importing `MacPermissionRecovery.js`
  directly, served via a one-off `python -m http.server`) was built first to
  show the icon in isolation -- the owner redirected to the real dev-error
  route instead; harness deleted, not kept.

## Open

- No commit made until this entry (conservative profile).
- Final 14x12px/-1px sizing is "good enough," not derived -- if the icon's
  alignment is revisited again, don't restart from cap-height/x-height
  math; see [[lesson-layout-css]]'s new entry first.
