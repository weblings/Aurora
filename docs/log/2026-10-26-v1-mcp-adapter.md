# 5ipy.43: aurora-mcp on /api/v1 (Aurora-5ipy.43)
Id: v1-mcp-adapter

Plan B7a in [[api-v1-plan]].

## Shipped

- Every `aurora-mcp` call goes to `/api/v1`: nodes, graph presets, drafts, validate, preview summary, test, apply, effects, state, capabilities and the pairing request and poll. No internal `/api/` path is left in `adapters/mcp`.
- `aurora_status` reads `configuredInputs` from v1 state, so the `/api/config` read is gone. `paused` comes from `state == "paused"`.
- `revert_effect` uses `PATCH /api/v1/state {effect}` instead of `PUT /api/effects`. A failed reload shows in the state's `errors`, which the tool reports as `reloadError`. The fetch hook in `main.cpp` gained PATCH.
- B5 had not aliased `nodes`, `graph/presets`, `graph/presets/:id` or `graph/preview/summary`, which the adapter needs. They are now served under v1 at Read scope with spec entries and schemas. The presets and preview registrations moved ahead of `registerPublicApiRoutes` in the three mains.
- `sequence_d_gate.py` uses v1 for its pairing request and poll, capabilities, graph/test and the LAN state check. It keeps `/api/state` where it asserts internal fields (`mcpEffectId`, `usesVideoInput`).
- Tests: `McpServerTests` 30/30, core `[api-spec]` 6 cases green, `gen-openapi.py --check` current.

## Verified live

- `sequence_d_gate.py` on Windows with the rebuilt app and adapter: 11/11 PASS, including `revert_effect` through PATCH state, `mcpEffectId` and the LAN scope phase.

- Lessons: none
