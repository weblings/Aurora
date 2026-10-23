# Kgv7: Dashboard pickers follow the MCP graph's declared inputs (Aurora-kgv7)

Id: kgv7-pickers-follow-graph

Closed 2026-10-23. Follow-up to Aurora-tc8w, which added `graphInputs` to `/api/state`. Root fix stays with
Aurora-kep2 (1.1.4).

## Shipped

- `DashboardScreen._renderTopTier`: while the MCP toggle is active and `graphInputs` is set, `DeviceField`
  takes its video/audio flags from `graphInputs`, not from the pipeline flags. A graph with no inputs
  builds no `DeviceField` (it would otherwise fall back to the Monitor picker). Outside MCP unchanged.
- The per-input hint flags added under Aurora-tc8w reduce to "no error showing", since the pickers now match.
- Vendor copy re-synced; `DashboardScreen.test.mjs` covers both, audio-only, none, and flags still saying
  video (config mode) with a source-less graph.

## Verification

- Live on the Windows app (fake-Hue stack, live video plus `windows-audio`): video, audio, both and the
  rainbow preset (no inputs) each ran as a light test for 10 s, `/api/state` `graphInputs` matched each,
  and the Dashboard showed the expected pickers (owner-confirmed). The WebUI is served from `web/ui`, no rebuild.
- Found on the way: an in-place test swap left `graphInputs` null; fixed under Aurora-tc8w (35061cc).

## Findings

- A source-less graph keeps the config's mode, so `usesVideoInput` stays true and the monitor picker stayed up
  until the picker followed `graphInputs`.
- `candles` was not in the fresh config; the rainbow preset stood in for the no-input case.

Lessons: none
