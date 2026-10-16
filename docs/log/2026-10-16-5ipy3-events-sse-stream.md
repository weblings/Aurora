# GET /api/events SSE stream (Aurora-5ipy.3)

Id: 5ipy3-events-sse-stream

EC 2b of [[external-control]]. Backend only. Closed 2026-10-16 with Aurora-cgr mitigated
([[cgr-tick-yield]]). The stream takes leaf locks only, but the `/api/state`
audio-sink lookup still takes the pipeline lock while running.

## Done

- `HttpServer::addStreamRoute` (GET, text/event-stream) with `EventStream`
  (`open()`, `write()`), `setStreamLimits(workers, maxStreams)`. Explicit
  pool: `max(8, cores-1)` base, 4x max. Stream cap defaults to half the base,
  over-cap answers 503 `too_many_streams`. `Impl::stop()` sets a stop flag and
  waits up to 5 s for open streams before destroying the server.
- `ChangeSignal` (revision + condvar, leaf mutex). `PipelineHost::changes()`
  bumps on every status publish and on condition set/clear, never from the
  tick loop.
- `registerEventsRoute` in all three app mains: `GET /api/events?topics=`
  with `state` (exactly the `GET /api/state` document, now one shared
  builder) and `health` (`errors` + `conditions`). Default all topics, unknown
  topics ignored. Each topic sends first on connect, then only when its
  document changed. `: ping` every 15 s. Brightness lives in config.json and
  has no signal, so streams re-read it about once a second.
- Access: plain GET, so remote callers follow the guard's default (reads open).

## Verification

- `AuroraNetworkTests`: stream delivers writes, `stop()` returns with a stream
  open, over-cap rejected with plain routes still answering, slot freed on
  disconnect.
- `AuroraPipelineTests`: first `state` event equals `GET /api/state`, pause
  emits `state`, condition emits `health`, topics filter, 3 streams plus a
  back-to-back `tick()` storm keep `GET /api/state` under 500 ms.
- Latency test uses `/api/state` (leaf locks), not `/api/monitors`, which waits
  on the tick lock.
- Core ctest all pass on MSVC Debug except `PairingService stores only token
  hashes and survives a restart` (revoke check, then `remove_all` sharing
  violation on Windows). Pairing code is untouched here, needs its own bead.

## Lessons

- 1 filed in output: an SSE stream pins a worker, cap it and wait for it in `stop()`.
