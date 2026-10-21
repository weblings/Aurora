# Aurora-4xqt.2 (D0b): MCP effect toggle on the Dashboard

Id: 4xqt2-mcp-effect-toggle

D0b of [[sequence-d-planning]]. The Dashboard grows a third toggle, hidden until
an MCP client has applied a graph. Core suite and web node tests green on Windows.

## Built

- `Request.client`: the `X-Aurora-Client` header, lowercased (the HTTP facade
  now surfaces it). `kMcpClient = "mcp"` in `ApplyRoutes.hpp`.
- `Config::mcpEffectId` (persisted, `NoEffect` in the apply table so saving it
  never rebuilds). Set by `POST /api/graph/apply` and by `PUT /api/effects` to a
  custom id when the marker is `mcp`. `ApplyDraftFn` takes the client, so
  test-on-lights confirm (keep) records it too.
- `DELETE /api/effects/<id>` clears it when it named that effect, active or not.
- `GET /api/state` reports `mcpEffectId` (null when unset).
- Dashboard: third `MCP` button after Audio only while `mcpEffectId` is set.
  It takes the fill only while `state.effect` equals it (Video/Audio go unfilled
  then, and their switches confirm only once it stops running). Click is
  `PUT /api/effects`, confirmed by the pipeline running that id.
- Demo shim answers `mcpEffectId: null`: the static page runs no MCP client, so
  the toggle stays hidden there. The four visibility cases are covered by core
  route tests and `CaptureSource.test.mjs`, not by shim state.

## Not done

- No real browser pass of the toggle (node tests only, no DOM harness).
- Toggle needs `hasAudio` (the row renders only on builds with an audio input).

## Lessons

- none
