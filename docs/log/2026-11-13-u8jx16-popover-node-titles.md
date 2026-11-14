# Graph editor: Problems popover node rows read the node's title, not its id

Id: u8jx16-popover-node-titles

`Aurora-u8jx.16` (P2, stage 7). Raised by the owner after 7c: a row read `rescale` while the canvas showed "Rescale image".

## What changed

- `web/graph-editor/src/graph/nodeTitle.ts`: `nodeTitle(info, type)` is the header's rule (catalog title, else type), used by `GenericNode` for the header, the unknown-type header and the actions label; `nodeLabels(nodes)` gives each popover row that title, the title plus the id when two nodes share it (`Gain (gain)`), and the id for a type the catalog lacks.
- `ProblemsChip.tsx`: node rows draw `nodeLabels.get(id) ?? id` and carry `data-node-id`; `App.tsx` builds the map from the flow nodes. Whole graph rows unchanged.
- `graph-editor-refused-save.mjs` reads the row's node from `data-node-id`, since the visible text is no longer the id.
- `nodeTitle.test.ts`: plain title, shared titles with ids, unknown type to id, empty title to type.

## Verification

- `web/graph-editor`: vitest 225 passed, `tsc --noEmit` clean, `vite build` ok.
- Browser checks by the coordinator, once each: graph-editor:refused-save 43 s, graph-editor:error-shell 42 s, graph-editor:narrow 24 s, graph-editor 27 s, graph-editor:gate 16 s, all pass. A one-off screenshot of the refused-save popover showed `Gain (gain)` for the graph's second Gain node (that graph has `gain_hue` and `gain`).
- The unknown-type row is covered by the unit test only.

## Lessons

- none
