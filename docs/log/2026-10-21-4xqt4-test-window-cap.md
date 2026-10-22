# Aurora-4xqt.4: test-on-lights window that fits a chat loop (closed)

Id: 4xqt4-test-window-cap

D0d of [[sequence-d-planning]]. Core pipeline suite 111 cases passing on Windows Debug.

## Built

- `LightTestOptions::confirmMs` went from 15 s to 120 s and is now the cap on a
  test kept alive by heartbeats. No separate extension logic: the 6 s heartbeat
  lapse already ends a silent test long before a 15 s window would, so the old
  window never did independent work.
- Unchanged: lapse revert at 6 s, pause, explicit revert, confirm.
- `confirmWithinMs` (start) and `confirmRemainingMs` (heartbeat, `GET /api/graph/test`)
  now report the cap and the time left under it.

## Verified

- Fake-clock tests: 59 heartbeats at 2 s keep the draft live past 15 s, the
  cap reverts as `confirm_timeout`, a lapse still reverts as `heartbeat_lost`,
  status reports 117000 ms remaining 3 s in.
- Sequence C e2e gate not rerun.

## Open

- 120 s is a guess for a read-and-reply loop, tune it from real MCP use.
