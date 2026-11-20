# 5ipy.38: Control scope (Aurora-5ipy.38)

Id: control-scope

Closed. Plan B2 in [[api-v1-plan]].

## Shipped

- `Scope::Control` between `Draft` and `Apply`. Tokens are stored by name and compared by enum order, so saved
  tokens of every existing scope still load.
- `/api/pairing/request` and approve take `control` through `scopeFromName`, no route change.
- `aurora-mcp --pair --scope control`, with usage and error text updated.
- Tests: scope ordering and name round-trip, a token of each scope reloads, a control request is approved as
  control, `pair` sends `control`. Network `[Pairing]` and MCP tests pass on Windows.
- WebUI PairedDevices not checked, the bead expected no change.

- Lessons: none
