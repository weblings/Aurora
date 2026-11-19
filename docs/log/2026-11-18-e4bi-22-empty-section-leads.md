# A stored empty section can lead the controls list

Id: e4bi-22-empty-section-leads

`Aurora-e4bi.22`. `deriveSections` placed a stored empty section after the one it followed, so it could never be first, and the editor refused moving it up. It now goes before the next stored section that shows, else before General. The refusal checks in `moveSection` and `dropSection` are gone, so Up is enabled for an empty section that is not first. The Dashboard reads the order through `deriveSections`, so it follows. `web/demo/vendor/webui` re-vendored.

## Verification
- `TuningControls.test.mjs` covers a leading empty section and a leading run. `tuningCards.test.ts` covers move and drop to the top.
- Graph-editor vitest 244 of 244, `tsc` clean, `web/ui` test scripts and vendor seam checks pass. Not exercised in a browser.

## Lessons
- none
