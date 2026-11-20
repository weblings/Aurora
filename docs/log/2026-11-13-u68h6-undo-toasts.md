# Graph editor stage 6g: toast audit, announce-only messages, Undo on lossy toasts

Id: u68h6-undo-toasts

`Aurora-u68h.6` (stage 6g, epic `Aurora-u68h`). No core, server or Grille change (Grille stays on `0.1.0-dev.12`; it has no Toast, so the toast stays editor-local). The live region is 6c's (`Announcer.tsx`); no second one.

## Toast audit

| Message | Where | Before | After |
| --- | --- | --- | --- |
| `Reverted` (Stop pressed) | `graph/status.ts` `quietEndToast`, new `stopAnnounced`; `App.tsx` | toast | announced only. The text was already `Reverted`; no `Test stopped` toast existed (the reword had happened earlier) |
| `Added <type>` | `App.tsx` `addFromMenu` | toast | announced only |
| `Restored`, `Discarded` | none | gone since 6b (kept copies restore silently; Revert to saved has its own words) | nothing to change |
| `Saved as X`, `Saved and live as X` | `App.tsx` `write` | toast | unchanged |
| `Test finished: the lights are back` (a Once test ran out) | `quietEndToast` | toast | unchanged |
| `Inserted <id> to convert A to B` | `App.tsx` `onConnect` | toast | unchanged |
| Wire refusals (`refuseConnection` reasons; three sites: connect, drop on a handle, converter refusal) | `App.tsx` | toast | unchanged |
| Test failed to start (the server's own words) | `testFailureToast`, 6c | toast | unchanged |
| `Removed N Dashboard controls with ...` | `App.tsx` `deleteNodes` | toast, 3 s | toast with Undo, 8 s |
| `Reverted to the saved version` | `App.tsx` `revertToSaved` | toast | toast with Undo, 8 s |
| `Loaded the saved version` | `App.tsx` `loadSaved` | toast | toast with Undo, 8 s |

- **Toasts the bead did not list:** none found. The `kept` end reason has no toast (`quietEndToast` returns null).
- **6d's "changes kept" confirmation** is the second sentence of the refused-save callout (`Your changes are kept in this browser.`, `App.tsx` `refuseWrite`), not a toast; nothing added.

## Undo

- **Toast** (`Toast.tsx`). `useToast().show(text, { doc, run })`. Grille's `Button` (`size="sm"`), a real tab stop after the text; the text stays in the `role="status"` span so it is read once. It never takes focus. 8 s (`UNDO_TOAST_MS`) instead of 3 s; hover or focus inside holds the timer, and leaving resumes with what was left (at least 1.5 s). A new toast starts from the real hover and focus state: a toast that closed under the pointer or with Undo focused never saw `mouseleave` or `blur` (its button was removed), and the stale flags kept the next toast held (found by the check). Ctrl/Cmd+Z remains the keyboard path.
- **Spent** after one press, or when the document changes to anything but the one the action left (`doc` in the offer): another edit, Ctrl+Z, another effect. Pressing Undo re-checks that identity.
- **Removed N Dashboard controls.** The delete is one history entry, so Undo is the history's own undo.
- **Reverted to the saved version.** Revert to saved is one history edit, so Undo is the same history undo. The kept copy it dropped needs nothing extra: the sync effect writes the kept copy whenever the document differs from the saved one, so it returns with the edits. The `discarded` ref 6b left for this is removed.
- **Loaded the saved version.** Not a history entry (the saved graph was already on screen), so Undo dispatches an edit to the kept edits, as Keep my edits does; the sync effect writes the copy again, based on the new saved version, so no second prompt follows a reload.

## Checks

New `graph-editor:undo-toast`: `Added` announced and nothing drawn; each Undo by mouse and by keyboard (Tab to the button, Enter); Ctrl+Z; spent by another edit; held past 8 s while hovered; a Saved toast has no Undo; the kept copy returns after Undo of Revert. `edit-loop`, `top-bar` and `test-outcome` now expect Stop's `Reverted` in the live region and no toast; `delete`'s toast-gone waits allow 12 s.

## Copy (owner review)

- `Undo` (button, `Toast.tsx`). The toast texts are unchanged.
- `Reverted` after Stop (`graph/status.ts`) and `Added <type>` (`App.tsx`): same wording, now announced only.

## Defaults chosen (not in the bead)

8 s; hover or focus pauses; at least 1.5 s left after resuming; no focus move on show or after Undo; the toast is the last element on the page, so Tab reaches Undo after a long walk and Ctrl+Z is the quick path.

## Lessons

- none
