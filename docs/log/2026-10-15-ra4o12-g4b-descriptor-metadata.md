# G4b: descriptors emit useWhen, example and cost (Aurora-ra4o.12)

Id: ra4o12-g4b-descriptor-metadata

Closed 2026-10-15. Second agent-path fix from the G2 review of
[[nodes-agent-ux]], so `GET /api/descriptors` (and Sequence B's `/api/nodes`)
carries the same node metadata the agent prompts need.

## Done

- `ControlDescriptor` gains `useWhen`, `example` and `cost` (node-type entries
  only). `NodeRegistry::toDescriptors()` fills them from `NodeTypeMeta`.
- `DescriptorRegistry::toJson()` emits each key only when non-empty, so
  existing control entries are byte-identical.
- All 13 Tier 1 nodes already had the metadata, so no node code changed.
- Tests: one per node family (`VideoNodesTests`, `AudioNodesTests`) fail if a
  registered node leaves `purpose`, `useWhen`, `example` or `cost` empty.
- Windows MSVC Debug: full suite 250/250.
- Lessons: 1 (architecture-process, bead premise was stale).

## Carried forward

- No units check: units already ride on param entries (`ParamSchema.unit`),
  and some Float params are legitimately unitless.
- Mac and Linux builds (only Windows run here).
- Remaining G2-review items: Aurora-ra4o.13 (`fixedAnchorHue` re-seed, may
  move goldens), .14 (Absent-tick anchor).
