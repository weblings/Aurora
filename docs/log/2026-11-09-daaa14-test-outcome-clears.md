# Graph editor: a test outcome clears on Save and on undo to the saved graph

Id: daaa14-test-outcome-clears

`Aurora-daaa.14`. The status spot is meant to show a test outcome until the next test, Save or edit. `App.tsx` only cleared it in an effect on the document that returned early when the graph was not dirty, so a Save and an undo back to the saved graph left a failed or ended-by-other test message showing.

## State

- The document effect now clears on any change after an effect is open (`changeIsEdit` in `graph/status.ts`: not from or to no document, not the same object). Opening an effect goes null then graph, so it does not clear.
- `write()` clears the outcome after a successful Save or Save and apply.
- Unit tests for `changeIsEdit` in `graph/status.test.ts`.
- Browser check `tools/browser-check/checks/graph-editor-test-outcome.mjs` (`npm run graph-editor:test-outcome`): lost-contact outcome shows on a freshly opened effect, clears on undo back to the saved graph (outcome arrives while dirty), clears on Save.

## Verification

- The browser check passes on the dev server with the fix, and fails at the undo step with the previous `App.tsx`.
- Not run: the embedded build. The outcome produced is a lost heartbeat; a takeover or time-limit outcome goes through the same clearing code but is not driven here.
- Not covered: Save and apply ending a running test, where a new "ended" outcome arrives after the write.

## Lessons

- Lessons: none.
