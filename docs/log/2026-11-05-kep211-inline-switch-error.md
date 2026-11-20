# Inline effect switch errors no longer double the banner or stick

Id: kep211-inline-switch-error

`Aurora-kep2.11`, under `Aurora-kep2`. Shipped in `8dcb323`, closed after
`Aurora-kep2.4` ([[kep24-failed-effect-no-fallback]]).

## State

- `isSwitchErrorStale` now clears the inline error on a failed host, checked each
  time state loads, because the banner owns that failure ([[error-overlay]]).
- The error stores the effect running when it was set, and clears once a different
  effect runs. So a tray, MCP or other tab switch clears an `unknown_effect` error.
- A PUT whose answer was lost sets no inline error when the host turns out failed.

## Verification

- Both cases are covered by failing-case tests in `CaptureSource.test.mjs` and
  `DashboardScreen.test.mjs`: a lost answer on a failed host, and another client's
  switch after `unknown_effect`. They were driven by tests, not reproduced live.
- Owner hand check of two-tab create and delete sync passed.
- Fake-Hue pass at 1280 and 390 ([[kep24-failed-effect-no-fallback]]): a failed
  switch showed the banner with no inline line beside it.

- Lessons: none.
