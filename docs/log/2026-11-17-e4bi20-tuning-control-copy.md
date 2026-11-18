# Problem copy says Tuning control

Id: e4bi20-tuning-control-copy

`Aurora-e4bi.20`. The `control_node_unknown` and `control_param_unknown` strings in `web/ui/problemCopy.js` said "A Dashboard control points at..." while the editor calls the list Tuning. Both now say "A Tuning control". The Dashboard renders the same copy, so it changes there too; no Dashboard-only wording of this family was found. The Whole graph row button that opens the Tuning drawer is "Open Tuning" (was "Open controls"), matching Hide Tuning; its action id `openControls` is unchanged. Editor and check comments follow. The frozen mocks (`web/ui/Static_GraphEditor_Mocks*`, `web/graph-editor/src/mock`) keep their wording.

## Verification
- All `web/ui/*.test.mjs`, `tsc --noEmit` and `vitest run` (295 tests) pass.
- `npm run graph-editor:error-shell` passes, 54 s (coordinator re-run).
