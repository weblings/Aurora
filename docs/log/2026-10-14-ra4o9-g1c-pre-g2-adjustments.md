# G1c pre-G2 runtime adjustments (Aurora-ra4o.9)

Id: ra4o9-g1c-pre-g2-adjustments

Closed 2026-10-14. Filed from a review of G0-G1b before the G2 node beads.
Two gaps would have blocked G2, and three cheaper fixes were taken before
nodes are written against the G1 API. G0 in [[node-graph-pipeline]] amended
to match.

## Done

- **Host services:** new `IGraphHost` (`GraphHost.hpp`) offering the video
  input, audio input, output by name and live zone map. `Graph::tick(dt, host)`
  puts it on every `EvalContext`. The registry stays host-independent. A
  missing service becomes a `GraphError`.
- **`Angle` port** pulled into Sequence A, so `audio.drift` can feed its
  anchor to `audio.bounce` (`updateBounce` reads it). `ImagePtr` alias added.
- **Deterministic order:** Kahn's sort over declaration indices with a
  min-heap. It no longer depends on `unordered_map` iteration, which differed
  between MSVC and libstdc++. The loader's duplicate cycle check was removed,
  so `finalize()` is the single source and names the nodes in declaration
  order.
- **Typed accessors:** `ctx.param<T>`, `ctx.input<T>`, `ctx.optionalInput<T>`,
  `ctx.requireHost()`, `ctx.fail()`. They throw, and the evaluator turns the
  throw into a node-named error.
- Tests: Angle added to the all-port-types round trip, plus 6 new cases (tie
  order, cycle naming, host services incl. a live zone edit, no-host error,
  typed accessors, Angle-into-Color rejection). Full core suite 218/218,
  Windows Debug.

## Carried forward (bead notes)

- G2a: image identity caching keeps Aurora-igwa. The DevFrameDump tap needs
  a home.
- G2b: re-anchor parity. `setSettings` resets both drift and bounce state.
- G2d: no in-place `setParam` for the ConfigData overlay. Agent metadata
  `useWhen`/`example`/`cost` is not exported to descriptors.
- G3: `adoptStateFrom` + swap under the PipelineHost lock. PipelineHost
  implements `IGraphHost`.
