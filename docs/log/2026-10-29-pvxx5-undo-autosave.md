# E2: undo/redo and browser autosave

Id: pvxx5-undo-autosave

`Aurora-pvxx.5`, from [[sequence-e-planning]]: snapshot history and a browser
backup over E1's single document ([[pvxx4-editor-foundation]]).

## Done

- **History** (`graph/history.ts`, a pure reducer that `App` runs with
  `useReducer`, so doc, past and future change together): snapshots, past
  capped at 100, new edit clears redo, `open` resets all of it. Selection, pan
  and zoom live in React Flow, not the document, so they are never recorded.
  History is not persisted.
- **Gestures:** param edits are `live`: the document updates at once and the
  pre-gesture snapshot joins the past once, on `commit`. `ParamWidget` commits
  on pointer-up, key-up and blur, and at once for toggles, selects and gradient
  add/remove. Any other edit, undo or redo settles an open gesture first. A
  gesture ending where it began, or an edit that changes nothing (React Flow
  reports a deleted node's edges as removed too), records nothing. Node drags
  already reached the document on drag stop.
- **Keys and buttons:** Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, plus Undo/Redo buttons.
  Ignored inside text and number boxes so those keep their own undo.
- **Autosave** (`graph/autosave.ts`): the document is written to
  `localStorage` per effect id whenever it differs from the baseline (what the
  server gave us), and removed when it matches. Every storage call is in
  try/catch; with storage blocked the editor runs unchanged. On open, a stored
  copy that differs from the server's shows Restore / Discard; autosave is
  held back until answered so the copy is not overwritten unseen. Restore is
  an ordinary edit, so Undo returns to the server version.
- **For E4:** saving must set `baseline` to the saved document; the autosave
  effect then clears the stored copy. No Save button exists yet.

## Verified

Vitest (48 total): gesture coalescing, cap, redo cleared on edit, reset on
open, empty-edit and no-op-gesture cases, restore offered after unsaved edits
and not after a save, per-effect keys, junk values, blocked and absent
storage. `npm run typecheck` and `npm run build` pass. Not run in a browser
and not on Windows or Linux (E6 gate); the Restore banner, key handling and
widget commit events are covered only by reading, not exercised.

## Lessons

None.
