# A dead or dropped Hue bridge raises a banner row and reconnects by itself

Id: lt66-output-link-monitor

`Aurora-lt66`, blocks `Aurora-kep2.10`. Shipped in `c702386`, with the fixes below on top.

## State

- `OutputLinkMonitor` runs off the tick loop every 3s in all three apps and holds one
  `output_link` host condition. The pipeline stays running, so the trigger keeps the effect name.
- `LinkState`: Ok, Busy (another app streams on a different area), Unreachable, Stopped.
- Unreachable and Busy raise a row and do not reconnect. Stopped raises a row, then rebuilds
  once the previous poll was not Ok. A paused host probes nothing.
- `ApiTools::streamState` reads the whole `entertainment_configuration` list through the pure
  `parseStreamState`, so another area's stream is visible. `bridgeReachable` is gone.
- Repeat reconnects wait twice as long each time, capped at 60s, reset by any poll not Stopped.
- `streamingActive` guards an empty `data` array.
- The fake bridge's area list now carries `status`, as a real bridge does.

## Verification

- Fake-Hue pass on a Windows Release build, scratch driver not committed, 14 of 15:
  - Bridge killed mid-stream: row in 2.8s, recovered in 5.6s with no button.
  - Stream stopped online: row in 3.1s, back in 5.9s.
  - Bridge down at build: row at once, recovered in 5.1s.
  - Paused: no row, no reconnect.
  - Another area streaming: Busy row in 0.3s, Aurora stayed off, back 6.1s after it stopped.
  - Area deleted: no crash, no stream starts in 30s.
  - The failure: after the area returned, Aurora's own stale stream stayed active on the fake
    bridge and read as Busy. With that stream expired by hand, recovery came on the next retry.
- Before the fixes the app died 0.8s after a 404 with `"data": []`. A 404 with no `data` key
  survived. That body shape is assumed, not captured from a real bridge.
- Hue tests pass. Core ctest 490 of 491 at `-j8`. The failure, the `Aurora-0tqq` takeover test,
  passed 4 of 4 alone. Fake bridge `check.py` 34 of 34.
- Not verified on a real bridge. The owner waived that acceptance line, follow-up
  `Aurora-qqcn`. Mac and Linux were not compiled.

## Open

- `Aurora-qqcn`: the area list's `status`, a silent stream expiring, a second app's stream and
  recovery after a power cut are all unproven on hardware.
- A deleted area keeps saying "reconnecting" and retries once a minute.
- Hue Sync on our own area shows no row: the status does not say whose stream it is.

- Lessons: 1, in `docs/lessons/output.md`.
