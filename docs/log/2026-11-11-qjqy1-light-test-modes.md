# Light test modes: Once (15 s) and Live

Id: qjqy1-light-test-modes

`Aurora-qjqy.1`. Follows the owner's pick of the Test split button in [[daaa32-test-split-zones-island]].

## Built

- `LightTestMode` Once or Live, passed to `LightTest::start`. Once ends with `confirm_timeout` at `confirmMs`, now 15 s. Live has no cap and ends on revert, confirm, supersede, replace or `heartbeat_lost` (6 s).
- `POST /api/graph/test` and `/api/v1/graph/test` take an optional `mode` ("once" default, "live"); anything else is 400 `invalid_mode`. The reply, heartbeat reply, `GET /api/graph/test` and the state `test` block all carry `mode`. `confirmWithinMs` and `confirmRemainingMs` are null for live. `mode` is null when no test runs.
- shell.js: a live test shows the banner row and Stop test without the "Will revert in" clock.
- OpenAPI updated (`LightTestBody`, `LightTestMode`, nullable remaining times). `info.version` left at 1.0.0 (pinned by ApiSpecTests).
- The 120 s value is gone.

## Verified

- Fake-clock core tests: once ends at 15 s despite heartbeats, live outlives 150 s with heartbeats then reverts on heartbeat loss, mode echoed in start, heartbeat, GET and state. 495/495 ctest on macOS, shell and graph-editor suites pass, mac app builds.
- Linux and Windows app builds are not run here (CI).

## Open

- Until Aurora-qjqy.2 and .3 land, the editor and MCP start Once tests, so their tests now end at 15 s.

## Lessons

- none
