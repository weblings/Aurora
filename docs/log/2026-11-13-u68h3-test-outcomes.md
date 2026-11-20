# Graph editor stage 6c: test outcomes the user did not cause, and the live region

Id: u68h3-test-outcomes

`Aurora-u68h.3` (stage 6c, epic `Aurora-u68h`). Built to the owner's 2026-11-13 note, which revises the bead: nothing is drawn on the Test button for these outcomes (no mark, outline or label change). No core or server change; Grille stays on `0.1.0-dev.11`.

- **Live region (reusable).** `web/graph-editor/src/Announcer.tsx`: `useAnnouncer()` returns `{ text, announce }`; `<Announcer text={text} />` renders the always-mounted, visually hidden `role="status"` / `aria-live="polite"` / `aria-atomic` region (`.visually-hidden`, `data-announcer`). `announce(message)` clears, then sets the text 50 ms later so the same message twice is spoken twice, and clears it after 10 s. Announce-only: nothing is drawn. `App` holds one; 6g (`Aurora-u68h.6`) calls the same `announce` for its announce-only messages. The checks read it with `announced(page)` / `waitAnnounced(page, text)` in `lib/editorMenu.mjs`.
- **End reasons.** The server's `lastEnd` (`LightTest.hpp`): `replaced`, `heartbeat_lost`, `stopped`, `superseded`, `pipeline_gone` are outcomes the user did not cause (`testOutcome` in `graph/status.ts`, wording from `describeTest` in `graph/lightTest.ts`, unchanged). The button is back at rest; the sentence is announced and is the first line of the Test caret menu (a disabled item and a separator above Once and Live), until the next test, Save or edit (the existing `clearedTest` rule). Not outcomes: `kept`, `reverted`, `confirmed` (the user's own), `confirm_timeout` (a Once test the tab started that ran out: its existing `Test finished: the lights are back` toast, which 6g keeps), `unreachable` (this tab's heartbeats failed three times in a row: Aurora is gone, so the "Aurora has stopped" takeover from 6a says it, and no test message duplicates it; with only the heartbeat route blocked and `/api/state` up, nothing is said), and a null reason (a Stop that found the test already over). "Time limit" in the note is `confirm_timeout`; the server has no cap on Live tests (`LightTest.hpp`), so no other time limit exists to map.
- **Failed to start.** `testFailureToast`: the user pressed Test (or a Stop the server refused) and `state.failure` is a toast with the server's own text (`api.ts` `refusal`: its `message`, else its code; `Fix the problems before testing` for an invalid draft). The mock caption "Test failed to start." was never `describeTest` wording and is not used.
- **Another session holds the lights: one source.** The shell's row and the button's `Take over` now both read `useHostState`'s poll. `useLightTest` no longer polls `/api/graph/test` while idle; its reducer lost `other` and the `seen` event. `pickStatus` takes `otherHolder` (from `otherTest(host.test, session)`); rank 5 shows only while this tab is idle. `App` also calls `host.checkNow()` whenever the tab's own test phase changes, so a start or end is seen at once. `Take over` can still lag a real change by up to one 3 s host poll, but now together with the row. The tooltip wording stays `Lights in use: <who> is testing` (`lightsInUseText`).
- **Banner path.** Rank 6 test outcomes and failures are gone from `pickStatus`/`pickBanner`; rank 6 is a failed Save only. `pickBanner` and `.editor-banner` stay for 6f.
- **Checks.** `graph-editor:test-outcome` rewritten: stopped from the Dashboard and another effect chosen are announced and the first menu line; the button's markup, header state, banner count and toast are equal to rest; the next test, an edit, an undo to the saved graph and a Save clear the line; a refused start is a toast and not a menu line. `edit-loop` and `gate` read the takeover from the live region (`Test ended: an agent took the lights`); `edit-loop`'s lost-heartbeat step now asserts rest and no message; `error-shell` asserts `Take over` appears and goes with the shell row. Unit tests: `status.test.ts` (rank 5 from the holder, rank 6 write only, `testOutcome`, `testFailureToast`), `e4.test.ts`.

## Copy (owner review)

Each outcome's menu line and announcement is the same sentence, from `describeTest` (`graph/lightTest.ts`), not new: `Test ended: another editor tab or window took the lights` / `Test ended: an agent took the lights` (the holder through `web/ui/testHolder.js`), `Test ended: Aurora stopped hearing from this tab. The lights are back`, `Test stopped from the Dashboard. The lights are back`, `Test ended: another effect was chosen`, `Test ended: the lights were paused or restarted`. Refused start toast: the server's text. New wording: none.

## Verification

See the bead's close note for the run; `web/graph-editor` typecheck, tests and build, and every `graph-editor:*` check.

## Lessons

- none
