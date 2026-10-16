# Tick loop yields the host mutex (Aurora-cgr)

Id: cgr-tick-yield

Fix built 2026-10-16, bead left open pending hardware verification. Unblocks
[[5ipy3-events-sse-stream]].

## Done

- `nextTickTime` in `TickClock.hpp`: next wake is one interval after the tick
  started, but never sooner than `MinTickYield` (1 ms) from now. An overrunning
  or very high-rate loop (1000 Hz, tick longer than its interval) now always
  releases `PipelineHost::m_mutex` for 1 ms, instead of re-entering at once
  with `sleep_until` in the past.
- `PipelineHost::tick()` returns the interval it used, so the loops drop the
  second lock round trip (`tickIntervalSeconds()`). All three app loops use
  both.

## Not done

- Hue stream still runs under the tick mutex, and monitors/zones are not
  served from last-known-good under `try_lock`. Either is the next step if the
  yield proves too little.
- Not reproduced on MSVC (see lesson). Needs the refreshRate 1000 check on
  real hardware: `/api/monitors` and a reload must answer.

## Verification

- `nextTickTime` unit test fails with the yield set to 0, passes with 1 ms.
- Core ctest 364: all pass but the unrelated Pairing revoke failure. Windows
  app builds.

## Lessons

- 1 filed in debugging-method: test the scheduling rule, not the starvation symptom.
