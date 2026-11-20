# E0c: output params list the registered outputs

Id: pvxx2-output-options

`Aurora-pvxx.2`, from [[sequence-e-planning]]: the `output` param on
`output.send`, `zones.sample` and `frame.smooth` is an Enum with empty
`enumOptions` (the loader checks it against `knownOutputs` only at load), so the
editor had nothing to build a picker from.

## Done

- **Filled into `/api/nodes` at request time**, not a new route. A new overload
  `registerNodesRoute(server, registry, configRoot)` (`GraphRoutes.cpp`) sets
  `options` on every Enum param named `output` with empty `enumOptions` to
  `graphOutputNames`: the saved Config's active outputs, else every registered
  one, i.e. exactly what a load accepts. Per request because "hue" registers
  after startup (the reload path re-registers it). The no-arg overload keeps
  the static catalog for tests that have no registry.
- All three apps (`mac`, `linux`, `windows`) call the new overload.
- `/api/v1/nodes` aliases the route, so v1 and MCP `describe_node` (reads
  `/api/v1/nodes`) show the same options with no MCP change. The OpenAPI schema
  already types `options` as a string array: no spec or `apiVersion` change.
- Test: `GET /api/nodes lists the loadable outputs on every output param`
  covers the unsaved case (all registered) and a saved Config narrowing it.

## Lessons

none
