# 5ipy.10: aurora-mcp control tools (Aurora-5ipy.10)
Id: v1-mcp-control

Plan B7b in [[api-v1-plan]].

## Shipped

- `set_running {running}`, `set_brightness {brightness 0-100}` and `set_effect {id}` call `PATCH /api/v1/state` with a one-field merge patch (Control scope, covered by an apply token). Each answers `state`, `effect`, `requestedEffect`, `brightness` and any reload `errors`.
- A 400 or 409 from Aurora comes back as a tool error with the problem body, so the agent can fix the call. Instructions tell the agent to ask the user first, since these act on the lights at once.
- Source tools are not added: B8 (Aurora-5ipy.44) has not shipped, so there is no writable `source` in PATCH state. They follow when it does.
- Tests: `McpServerTests` 32/32 (patch round-trips, bad arguments, Aurora's 400 surfaced). `sequence_d_gate.py` gained a "control tools" step: 12/12 PASS on Windows.

- Lessons: none
