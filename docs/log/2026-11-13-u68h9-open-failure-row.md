# Graph editor stage 6h: a failed effect or catalog load is an error-shell row without Retry

Id: u68h9-open-failure-row

`Aurora-u68h.9` (stage 6h, epic `Aurora-u68h`). The last message on the old editor banner: an effect or the catalog would not load although `GET /api/state` answered. No core, server or Grille change (Grille stays on `0.1.0-dev.12`).

- **Server codes confirmed** (`core/Runtime/src/EffectsRoutes.cpp` `effectDocumentToJson`): 404 `{"error":"unknown_effect"}` and 422 `{"error":"unreadable_effect","message":...}`.
- **`api.ts`.** `getJson` throws `ApiError` (`status`, body `error` code or `''`) on a non-OK answer; a network failure or a bad success body passes through as before.
- **Cause and wording** (`graph/hostState.ts`): `openFailureCause(status, code)` is `not_found` (404 + `unknown_effect`), `unreadable` (422 + `unreadable_effect`) or `other`; `openFailedNote(cause, title)` words the row. `App` keeps `openError` as `{ cause, id }` (`id` null for the catalog), set only when `host.checkNow()` says Aurora answered (the 6a gate, so an unreachable Aurora still gets the takeover and the recovery rerun). `<title>` is the effects-list title for the id, else the id; the row rewords itself when the list arrives. The row rides in `ErrorShell` `notes` beside `draftShellNote`. A successful effect load clears it; a successful catalog load clears a catalog failure.
- **Status.** `pickStatus` takes `openError: boolean`. `unreachable` keeps rank 1 `Cannot reach Aurora`; `openError` is rank 1 `No effect is open`. Test's disabled reason is `status.label` at rank 1, so the tooltip is the label. `pickBanner(hasOffer, status)` lost its `openError` parameter and the `unreachable` kind; the Retry `.editor-banner` is gone. `attempt`/`setAttempt` stay for the recovery rerun. The writeTrouble `notice` banner, `pickBanner` and `.editor-banner` are 6f's.
- **Rank 1 and 6d's "never disabled" rule do not conflict.** 6d's rule is about problems (a graph with problems refuses and points at the chip). Rank 1 `blocked` is a different gate, unchanged: nothing is open (or Aurora is silent), so `TitleMenu`'s `off = busy || blocked` still disables Save, Save as new and Save and apply. Open and New stay enabled.
- **One addition the bead did not list.** The title button was `disabled={!doc}`, and a failed load leaves no document, so Open was unreachable (only the Dashboard link was). It is now `disabled={!doc && !openError}`, and `TitleMenu` takes `nothingOpen` (`!doc`) to disable Rename (a custom effect that would not load).
- **Tests.** Unit: `status.test.ts` (rank 1 both labels, no `unreachable` banner), `hostState.test.ts` (cause and the three wordings), `ErrorShell.test.tsx` (the three notes render as rows, no Retry). Browser: `graph-editor:top-bar` rank 1 step rewritten (404 fulfilled, row text, no button in the shell slot, no `.editor-banner`, `data-preview` `No effect is open`, Test disabled with that tooltip, Save items off, leave through Open, row gone), plus 422 and 500 rows.

## Copy (owner review)

- `No effect is open` (rank 1 label and Test tooltip, `graph/status.ts`): the bead's proposal. Its `detail` `The error above says why.` is not shown anywhere today.
- Row wording as given by the bead (`graph/hostState.ts` `openFailedNote`): `<title> no longer exists.`, `<title>'s file can't be read.`, `Couldn't open the editor.`

## Lessons

- none
