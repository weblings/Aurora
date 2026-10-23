# Aurora-52oz.6: draft preview stream of zone colors (closed)

Id: 52oz6-draft-preview

C5 of [[sequence-c-planning]]. Core suite 407/407 on Windows Debug. The three
app `main.cpp` files got the same registration line, only the Windows app
rebuilt (Release, compiles).

## Built

- `GraphPreview` (`GraphPreview.hpp`): a second `Graph` per session, ticked by
  `GraphRunner::tick` right after the live graph. Its host delegates inputs and
  zone maps to the live host and answers `output()` with a `Sink` that swallows
  frames, so `output.send` can never reach an output.
- Snapshot per tick: per-output zone colors (0..1 floats) from the sink, kept
  under a mutex so another thread samples the latest value without queuing.
- Errors: a failing node never reaches `output.send`, so the preview reads the
  `GraphError` off the edge feeding it. The output's live zone ids all turn
  magenta with `error: true`, plus an `errors` list (output, node, message).
  An `Absent` value keeps the previous colors.
- `GET /api/graph/preview?session=<id>` (`PreviewRoutes.hpp`), a stream route so
  it counts against the event-stream cap. Read scope, which a draft token holds.
  Polls every 66 ms (about 15 Hz), sends `preview` only when the colors changed
  (`tickMs` is excluded from that comparison), pings after 15 s idle.
- Draft edits reload the preview in place (node state kept) and show up in the
  same stream. A bad edit sends `error draft_invalid` once and the last good
  graph keeps running.
- Stream errors are SSE events, since a stream handler cannot set a status:
  `invalid_session`, `no_draft`, `cannot_preview` (stream ends). Ends with
  `ended`: `draft_deleted`, `pipeline_gone` (pause or any rebuild), `replaced`
  (a second stream for the session).
- `Pipeline::openPreview` refuses what `testGraph` refuses: other inputs than
  the running ones, or the dev dual-capture spike. Nothing reloads for a preview.

## Verified

- Fake output sees 2 sends per tick (2 live outputs) with a preview streaming,
  none from the preview. Unit test: live output `sends == 0`.
- Cost, from the throttle test on Windows Debug with a fake input: the preview
  tick `tickMs` and the live tick with and without a preview are logged in the
  test and asserted far inside the 33 ms budget at 30 Hz.
- Throttle: events never exceed elapsed / interval + 3.
- Not run on the fake-Hue stack: nothing here touches the Hue path.

## Decisions

- The preview graph runs its own `video.capture` against the shared input, so it
  shares the capture, not the node's cached image. A second `grabFrameSubsample`
  per tick is the cost. Sharing the live capture node's output is a later
  optimization if the logged cost ever matters.
- Per-node previews stay in Sequence E.

## Lessons

- A one-edge `"edges"` literal in nlohmann collapses to a flat array (docs/lessons/language-cpp.md).
- A sink-based preview reads the error off the edge feeding `output.send` (docs/lessons/architecture-process.md).
- An SSE stream handler cannot set a status, so refusals are events (docs/lessons/architecture-process.md).
