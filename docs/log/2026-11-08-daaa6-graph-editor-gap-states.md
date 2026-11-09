# Graph editor cleanup: gap states and the status priority rule

Id: daaa6-graph-editor-gap-states

`Aurora-daaa.6`. Designed the states the first mock skipped and wrote the status priority rule, in `docs/planning/WebUI/GraphEditorCleanup.md` (Status priority rule). Unblocks `Aurora-daaa.11`.

## State

- Seven frames in the mock's `Gaps` group (`web/ui/Static_GraphEditor_Mocks`): `#restore`, `#takeover`, `#changed`, `#reconnect`, `#name`, `#offline`, `#wholegraph`. New pieces: a one-line banner under the bar, a status spot that can carry an action button, and a `Whole graph` row in the problems popover.
- Rule: banner for blockers and questions, status spot for ranked state, toast only for caused success and minor refusals. Errors and outcomes needing action never toast. Ranks 1-7 plus two toast rows.
- The nine slots are the ones rendered in `App.tsx` (restore, status, Reconnect, refusal, error, dirty, test note, notice, graph problems). Each maps to a place in the doc's table.
- With Keep dropped, its disabled state becomes `Edited since the test` in the bar and a warning in the title menu.

## Verification

- All seven frames screenshotted in headless Chromium at 1280x720 with no console errors. Restore, Edited during test and Graph-wide problem were read by eye; the other four were rendered without errors but not read.
- Not checked: the frames at the 720px narrow breakpoint, and the banner's real focus and announce behavior (`role="alert"` is in the mock only).

## Lessons

- Lessons: none.
