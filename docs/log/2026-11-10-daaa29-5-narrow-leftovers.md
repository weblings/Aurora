# Graph editor: 1100 px no-pan assertion, drawer-body container queries skipped

Id: daaa29-5-narrow-leftovers

`Aurora-daaa.29.5`. Two items left out of `.29.2` and `.29.4`.

- `graph-editor-narrow.mjs` now closes Details at 1100 px, records the `.react-flow__viewport` transform, reopens Details on Rescale (already clear of the drawer) and asserts the transform is unchanged. Passes. Not run against a deliberately broken pan, so the assertion's failure case is unproven.
- Container queries in the Details and Dashboard controls drawer bodies skipped: single-column full-width rows fit at 400x800 and 1100 px. The decision and the trigger for revisiting it are in [[graph-editor-cleanup]] (Decisions, narrow windows). The check does not assert on the drawer bodies themselves, only page scroll and controls outside the window.

## Verification

- `npm run graph-editor:narrow` passes.

## Lessons

- none
