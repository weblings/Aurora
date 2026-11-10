# Graph editor: user-facing node copy

Id: daaa24-2-node-copy

`Aurora-daaa.24.2`, second child of `Aurora-daaa.24` (cascade Add node menu). Every node type now has the two user-facing texts from direction 3.

## State

- `NodeTypeMeta::summary` (menu row, at most 10 words) and `NodeTypeMeta::tip` (hover tooltip, one sentence, at most 12 words) on all 53 nodes. `purpose` and `useWhen` are unchanged and stay the agent text.
- Carried through `/api/nodes`, `/api/v1/nodes`, `ControlDescriptor`, `server-samples/nodes.json` and `NodeTypeInfo` in the editor.
- The catalog test in `PipelineTests.cpp` fails for a missing summary or tip, one over the word limit, or one containing a type id. It does not check that a tip is one sentence.
- Only Bar image's tip names another node (LFO, from the doc's example).

## Verification

- Core 491/491, graph-editor vitest 114 passed, `tsc --noEmit` clean.
- Not run here: the editor reading the new fields (stage 3 menu work, `Aurora-daaa.24.3`).

## Lessons

- Lessons: none.
