# Graph editor: test-ended outcomes are announced, only a lost heartbeat is a toast

Id: u8jx42-test-ended-toast

`Aurora-u8jx.4.2` (P2, item 6 of `Aurora-u8jx.4`), owner decision 2026-11-13. It reverses part of stage 6c ([[u68h3-test-outcomes]]). No core, server or Grille change; `writeFailureReason` copy is approved as is and untouched.

## What changed

- **The Test caret menu is Once and Live only.** The outcome line (a disabled `MenuItem` plus separator) is gone from `SplitTestButton.tsx`, with the `outcome` prop and the `clearedTest` state in `App.tsx` that cleared it on the next test, edit or Save (`dismissTest`). Nothing else read them.
- **Announcements are unchanged.** Every outcome `testOutcome` words (replaced, heartbeat lost, stopped, superseded, pipeline gone) still goes to the live region.
- **Heartbeat lost is also a toast**, `Test ended: Aurora stopped hearing from this tab. The lights are back`: `quietEndToast` returns it, no debug steps, no action (the lights return by themselves). Replaced is the shell's light-test row, stopped and superseded are user-caused, pipeline gone shows on the Dashboard, and confirm timeout keeps its toast.
- A lost heartbeat speaks once: the toast's own `role=status` span (Toast.tsx) is the announcement, so the `testOutcome` announce effect in `App.tsx` skips any `ended` that `quietEndToast` toasts. The other four outcomes are announced through the Announcer.

## Docs and checks

- [[graph-editor-cleanup]]: the Test button row, the live region row, the "(was 6) test ended" row and Rule 6 of the priority rule. `web/graph-editor/README.md` Announcer line.
- Unit tests (`status.test.ts`): `quietEndToast` is non-null only for Reverted, confirm timeout and heartbeat lost, with the exact heartbeat wording.
- `graph-editor:test-outcome`: the menu stays plain after every outcome, and a lost heartbeat is a toast with no action. The check cannot make the server time a tab out (6 s of silence races the tab's own three-failure "unreachable"), so it answers the heartbeat as the server does once it has ended the test (404 `no_test`, `lastEnd: heartbeat_lost`). The server-side timeout itself is not exercised there.

## Verification

Run 2026-11-13, port 8215 free, each browser check inside the stack lock: `npm test` (184 passed), `npm run typecheck`, `npm run build` all pass; `graph-editor:test-outcome`, `graph-editor:top-bar` and `graph-editor:control-count` (11 and 10 chrome controls, at their ceilings) all pass. The heartbeat step asserts the toast text is the words alone, has no button, and that `[data-announcer]` does not also hold it. Screenshots (toast, plain Once and Live menu) were looked at.

## Lessons

None.
