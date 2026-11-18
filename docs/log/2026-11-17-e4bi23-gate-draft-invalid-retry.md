# Browser checks: the gate retries a missed draft_invalid status

Id: e4bi23-gate-draft-invalid-retry

`Aurora-e4bi.23`. Under `npm run graph-editor:set`, `graph-editor:gate` failed 2 of 3 runs at its draft_invalid step: `waitStatus(/would not load/)` timed out after 10 s and threw out of the Aurora-gujj retry loop, which only retried a missing chip. The likely cause is the editor's own debounced draft PUT landing after the check's, so the status never read "would not load". The loop now waits 3 s per try and retries a missed status as well, breaking only when the status was seen and the chip stayed. Assertions unchanged. The flake did not recur under the new code, so the cause is inferred from the code path, not observed.

## Verification
- Agent: `graph-editor:set -- gate` 6 of 6 and `graph-editor:gate` alone pass. Coordinator: `graph-editor:set -- gate` 3 of 3, then the full `graph-editor:set` 16/16 in 227 s with `Aurora-e4bi.6` in the tree.

## Lessons
- none
