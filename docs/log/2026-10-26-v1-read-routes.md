# 5ipy.40: v1 read routes (Aurora-5ipy.40)

Id: v1-read-routes

Plan B3 in [[api-v1-plan]].

## Shipped

- `registerPublicApiRoutes` registers `GET /api/v1/` `state`, `events`, `capabilities`, `version`, `effects`,
  `effects/:id` and `descriptors`, all at Read scope. It takes a `PublicApiInfo` (platform, app version, Hue
  compiled in, `canSelectMonitor`, descriptor registry) that the three mains fill in.
- v1 state is the internal state minus `paused`, `mcpEffectId`, `canStop`, `usesVideoInput`, `usesAudioInput`
  and `audioDevicesUrl`, plus `configuredInputs {video, audio}` (null when unset) and `brightness` as percent.
- v1 events run the shared loop with v1 payload builders, so the first `state` event equals `GET /api/v1/state`.
- `capabilitiesToJson`, `effectsListToJson` and `effectDocumentToJson` are shared with the internal routes.
  v1 capabilities leave out `paused`. `kApiVersion` is `1.0.0`.
- Spec entries and schemas in `docs/api/openapi.yaml`, `openapi.json` regenerated. The route-walk registers the
  routes on an idle host. Catch2 tests in `PipelineTests.cpp` cover each route and the Read scope.
- The unversioned `GET /api/version` also carries `apiVersion`, as the probe for which majors exist.

## Stream cap

- The cap is half the worker pool: `max(1, max(8, cores - 1) / 2)`, so 4 up to 9 hardware threads.
- One stream per client: WebUI tab (events), MCP client (none today, it polls `graph/preview/summary`) and
  MQTT bridge (events). Three at most, plus one graph preview stream while the editor is open, makes 4.
- Fits the default with no headroom on a 4-stream machine. A second WebUI tab or a second preview pushes the
  fifth client to a 503. Default left as is, the spec tells adapters to hold one stream each.

- Lessons: none
