# Zfre: /api/state reports the light test, the WebUI can stop it (Aurora-zfre)

Id: zfre-test-state-and-stop

Closed 2026-10-22. Found during [[r7ff-noise-nodes]]. Unblocks Aurora-exbp (shell banner with Stop test).

## Shipped

- `GET /api/state` (and the events stream's `state` topic) carries `test: {active, confirmRemainingMs}`
  from `LightTest::info()`. Inactive when no LightTest is wired (tests, demo). The stream re-reads it with
  brightness about once a second, so a running test pushes its countdown at that rate.
- `POST /api/graph/test/stop`: no body, no session match. Reverts whichever session's test runs,
  `lastEnd` `stopped`; that session's next heartbeat gets `no_test`. Needs `admin` (loopback trusted),
  the rest of `/api/graph/test` stays `apply`.
- `LightTest::stop(error, reason)`.
- Effect choices end a test: `registerSettingsRoutes` takes `onEffectChosen`, run after the reload for a
  PUT naming `activeEffectId`; the app mains pass it and also run it after the `/api/effects` reload.
  It stops the test with `lastEnd` `superseded`. The revert reads disk, so it lands on the new choice.
- App mains register draft/apply/test routes before settings, state, events and effects, so those get the LightTest.

## Verification

- Confirmed by test: during a test, the Video toggle (`PUT /api/config {"activeEffectId": "builtin.video"}`
  while video runs) applied in place ("Config applied live, no pipeline reload") with no generation change,
  so the test would have lived on and reverted over the click later. It now ends at the click.
- New PipelineTests: state reports the test and `/stop` ends another session's test (heartbeat 404 after);
  toggle and `PUT /api/effects` during a test end it in place with no reload, a brightness save does not;
  `/stop` scope is admin (apply forbidden, loopback allowed). Kea state-shape test updated.
  Core suite 120/120 (MSVC Release).
- Live on the Windows app (fake-Hue stack, dummy input): a test from a separate session showed in
  `/api/state` (`active`, `confirmRemainingMs` 119984); `/stop` with no session ended it (200), the
  session's heartbeat got 404 `no_test`, `/stop` with none running gave 404; `PUT /api/config
  {"activeEffectId":"builtin.video"}` mid-test ended it with `lastEnd` `superseded`; the
  `/api/events` state event carries `test`.
- Not verified live: the lights landing on the right graph after the toggle (the script read the wrong
  `/api/graph` fields; the unit test covers it). Mac and Linux mains got the same edit, not built.

## Findings

- A mode switch that changes inputs rebuilds the pipeline, so the test already ended there (`pipeline_gone`).
  Only an effect choice that changes no reload field slipped through.

## Lessons

- none
