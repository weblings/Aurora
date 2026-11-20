# Lane A review follow-ups (Aurora-5ipy.28 to .34)

Id: lane-a-review-followups

Plan A9 to A15 in [[api-v1-plan]], filed from a review of Lane A. Code is in (9975baf to 98e1159). A10, A14 and
A15 stay open until their Linux, Mac and CI runs are recorded. Monitor-key items (A9 to A12) are written up in
[[stable-monitor-keys]].

## Shipped

- A9 to A11: monitor key fixes, see [[stable-monitor-keys]].
- A12: `canSelectMonitor` moved from `/api/monitors` to `/api/capabilities`, fixed per host. Windows and Mac pass
  true. Linux passes true only when the environment picks the X11 backend.
- A13: `/api/reload` 500 answers `reload_failed`, `PUT /api/state` 500 answers `set_running_failed`, Hue test pulse
  502 answers `test_pulse_failed`. The old free text moves to `message`, which the problem body carries as
  `detail`. A non-string `error` or `message` no longer throws in `normalizeProblem`. The WebUI never displayed
  these strings, so it is unaffected.
- A14: `adapters/**` is in the Linux, Mac and Windows workflow path filters, and each workflow has
  `workflow_dispatch`.
- A15: `tools/light-viz-relay/lane_a_gate.py` checks problem+json and the JSON 404, pairing poll 202, 429, 403 and
  404 with `interval` and `expiresIn`, the full queue's 429, `retry: 3000` on `/api/events`, capabilities, version
  and stop against the devstack. A 410 needs the 300 s lifetime, so only PairingTests cover it.

## Fixes after review

- The gate's slow-down step polled twice and expected the second to be 429. The server counts whole seconds, so a
  pair that straddles a second boundary gets 202 and the step failed. It now repeats the fast poll up to 5 times.
- A11 had only a selector test. Three `Pipeline::build` cases now cover the disk write: a name is migrated and a
  second build leaves it, a pick landing mid-build wins, a keyless monitor keeps its name. The test fake gained a
  `selectMonitor` override, without which any saved monitor name made the build throw.

## Verification

- Windows standalone core suite 442/442 (fresh `build/core-test-win`, since `build/core-test` is a WSL configure).
- Web: `TuningFields.test.mjs` passes, demo vendor closure check passes. `lane_a_gate.py` compiles.
- Not done: `lane_a_gate.py` run on any OS, Linux and Mac CI runs, Linux `X11MonitorKeyTests` run.
- Mac (2026-10-25): core suite 443/443, `mac-app` builds, `lane_a_gate.py` 6/6. Mac CI run not checked (no `gh`), Linux still not run.
- Linux (2026-10-25): core suite 443/443, `linux-app` builds, ctest 194/194 incl. `X11MonitorKey` 5/5, `lane_a_gate.py` 6/6
  (`canSelectMonitor` false on this Wayland box, as designed). Linux CI run not checked (no `gh`); the local equivalent of
  its steps (linux-app configure/build/ctest, standalone core configure/build/ctest) is green. Found and fixed a Lane A
  build break: `X11Grabber.cpp` called `edidHashKey` unqualified from the anonymous namespace, where the forwarding
  header's `using` (in `Aurora::Input::Linux`) does not reach; now qualified `Aurora::Input::edidHashKey`, matching
  `WindowsGrabber.cpp`. A10's "Linux build green" and A15's Linux launch check are done; A14 still owes the green CI run.
