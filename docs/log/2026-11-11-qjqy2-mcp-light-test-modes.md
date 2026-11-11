# MCP try_on_lights: Once by default, keep after a timeout

Id: qjqy2-mcp-light-test-modes

`Aurora-qjqy.2`. Builds on [[qjqy1-light-test-modes]].

## Built

- `try_on_lights` takes `mode` (`once` default, `live`) and always sends it in the test request; anything else is a tool error. The result carries `mode`. Tool description, server instructions and `adapters/mcp/README.md` no longer say two minutes.
- Core: `LightTest` keeps the session and draft of a Once test that ended by `confirm_timeout`. `/api/graph/test/confirm` (so `keep`) still lands for that session while the draft is unchanged. Any new start, revert, stop or other end drops it, so a takeover, an explicit revert or a lost heartbeat gives 404 and an edited draft gives 409. It lands once.
- The graph editor shares the confirm route, so its Keep also works after a timeout.

## Verification

- `AuroraMcpTests` 34/34 (default once body, live, invalid mode, keep after timeout, keep refused after takeover and changed draft). `AuroraPipelineTests [LightTest]` 16/16 including the new late-confirm case, `AuroraRuntimeTests` all pass. Mac app builds.

## Lessons

- none
