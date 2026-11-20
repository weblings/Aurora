# Failed effect switches announce through the live region

Id: kep220-failed-switch-announce

`Aurora-kep2.20`, under `Aurora-kep2`.

## State

- `DashboardScreen._switchMode` and `_deleteRunning` announce a failed host after
  `_loadAll`, using the `reload` error row (else the first row with a message).
- `_onHeartbeatState` announces when the failed message differs from the last one
  spoken, so a first failure that `_loadAll` stored first, or a changed failure on a
  failed host, is no longer silent. A counter keeps heartbeat and flow from doubling.
- Tests drive `_switchMode` for one announcement, heartbeat first, and a repeat failure.
- `web/demo/vendor/webui` was re-synced. The browser check was not run live.
- Lessons: none.
