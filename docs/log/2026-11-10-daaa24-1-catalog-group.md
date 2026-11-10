# Graph editor: catalog group field

Id: daaa24-1-catalog-group

`Aurora-daaa.24.1`, first child of `Aurora-daaa.24` (cascade Add node menu). Every node type now carries the Add-node menu group the cascade will list it under.

## State

- `NodeTypeMeta::group` on all 53 nodes, assigned per the mock map in `web/ui/Static_GraphEditor_Mocks/mock.js`. The fixed set is `kNodeGroups` in `NodeRegistry.hpp`: Sources, Audio, Image, Color, Numbers, Motion, Lights.
- Carried through `/api/nodes` and `/api/v1/nodes`, the node descriptors (`ControlDescriptor::group`), `server-samples/nodes.json` and `NodeTypeInfo` in the editor.
- MCP `list_nodes` returns `group` per entry and takes an optional `group` filter. `category` stays a type-prefix filter and its description says so.
- The catalog test in `PipelineTests.cpp` fails for an empty or unknown group, so a new node cannot skip it.

## Verification

- Core 491/491, MCP 32/32, graph-editor vitest 114 passed, `tsc --noEmit` clean.
- Not run here: a live `list_nodes` call against a running Aurora.

## Lessons

- Lessons: none.
