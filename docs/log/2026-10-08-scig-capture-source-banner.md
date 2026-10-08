# Aurora-scig: Capture Source (NUX) errors move to the shell banner (closed)

Id: scig-capture-source-banner

2026-10-08. Follow-on to Aurora-98pr, which moved saved-not-applied errors
from Dashboard's inline rows to the shell banner. The NUX Capture Source step
(`ModeDeviceScreen`) still drew them inline.

## Done

- `ModeDeviceScreen`: a `reloadError` no longer renders inline. The screen
  sets `reloadFailed` (still hides the Audio note and device hint, as the old
  inline error did) and calls `app.checkNow()` for an early banner redraw. A
  failed save still shows inline, as on Dashboard.
- `shell.js`: the `reload` onboarding gate is now `!RELOAD_ERROR_ROUTES.has(route)`
  (`mode-device`, `zone-mapping`, `dashboard`). It used to hide `reload` on
  every route but Dashboard, which would have hidden a real capture-permission
  failure on Capture Source.
- `ModeDeviceScreen.mount` sets `app.platform` from `/api/capabilities`. Without
  it the banner's Mac permission row never matched on the NUX and showed the raw
  `permission_denied: ScreenCaptureKitGrabber...` text with Retry only.
- Audio banner copy: `renderAudioPermissionBanner` now reads "Aurora can't hear
  any audio. If needed, allow Aurora under "System Audio Recording Only" in
  System Settings." Aurora-o1qt had reworded only the C++ `kMessage`, which no
  screen displays; the shell draws its own text.
- Tests: shell gate cases for all four pairing routes plus `mode-device`;
  `ModeDeviceScreen` cases for the banner path, `_doApplyMode` and `mount`
  setting the platform; the three old "System Audio Recording Only" assertions
  updated. Demo vendor copy re-synced (commit hash and descriptors only).

## Findings

- "Still the old copy" took several fresh-copy relaunches. The served files
  already had the change; the cause was `app.platform` unset on that screen.
  Lessons: navigation-flow (shell reads state one screen sets), components
  (daemon message vs renderer text), debugging-method (curl the served file,
  then trace the render condition).
- `C++ kMessage` left as is (API payload only); changing it needs a rebuild.

## Verified

- All `web/ui` and `web/demo` node tests pass.
- Live on a `make-fresh-localnet-copy.sh` copy launched with `--fresh`: owner
  confirmed the Capture Source Screen Recording row is fixed.
- Not verified: the final audio wording on screen (changed after the last
  look at that row).
