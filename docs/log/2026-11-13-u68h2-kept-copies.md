# Graph editor stage 6b: kept copies restore silently, Revert to saved, own ids for new effects

Id: u68h2-kept-copies

`Aurora-u68h.2` (stage 6b, epic `Aurora-u68h`). No core or server change; Grille stays on `0.1.0-dev.11`.

- **Silent restore.** The Restore/Discard banner use is gone (`App.tsx` renders nothing for it; `pickBanner` and `.editor-banner` stay for 6f, called with `hasOffer` false). An effect that opens with a kept copy gets it back as one edit on the saved graph, so one Undo reaches the saved version. No toast.
- **Unsaved state, not drawn.** 6d draws the dot with Grille's `dotIcon` (dev.12). 6b adds `isUnsaved(baseline, doc)` (`graph/autosave.ts`, the old `dirty`) and `data-unsaved="true|false"` on the title button. The bar's existing `Unsaved` word and `.editor-dirty-mark` CSS dot are older code, left as they were; 6d replaces them. Nothing new is drawn.
- **Revert to saved.** Title menu, after Rename, disabled when there is nothing to revert, on built-ins too. It puts the saved graph back as one edit (Ctrl+Z still reaches the edits), drops the kept copy, toasts `Reverted to the saved version`. `App` keeps the discarded graph in `discarded` (ref, `{id, doc}`) for 6g's Undo; Undo itself is not built.
- **Newer saved version prompt.** `NewerSavedPrompt.tsx`, a Grille `Modal` on open, only when the saved graph's fingerprint differs from the one recorded in the kept copy. Title `<Effect title> has a newer saved version`, body `Your unsaved edits are out of date.`, buttons Load saved and Keep my edits. Keep my edits has `autoFocus`, and Escape and a scrim click give it. Load saved drops the copy and toasts `Loaded the saved version` (Undo comes in 6g, from `discarded`). While the prompt is open the editor shows the saved graph and does not write the kept copy. The words in the title and body are the bead's; the buttons' order puts Load saved first.
- **Kept copy format.** `{v:2, base, doc}`; `base` is an FNV-1a fingerprint of the saved graph the edits were made from (`fingerprint`), rewritten on every sync, so Keep my edits re-bases the copy and the prompt is not repeated. Copies written before this hold the bare graph: no base, so they restore without a question. `openKept(id, server)` returns `none` (no copy, or equal to the server, which clears it), `restore` or `newer`. `restorable` is gone.
- **Own ids for new effects.** `newEffectId()` makes `@new-<6 chars of a-z0-9>`; New ▸ Empty and a `?new=empty` start use it, and `?effect=@new-xxxx` is in the URL, so a reload reopens the same new effect with its kept copy. `isDraftId` (any `@` id) opens a blank graph and counts as a built-in for saving. At first Save the effect gets its title-slug id (`freshEffectId`); the draft id's copy is cleared, and edits made while the write ran are saved under the new id with the just-saved graph as their base. Built-in start points still open the built-in itself (as before), so no `@new-` id is made for them.
- **Legacy `@empty`: migrated.** At page load, `migrateLegacyBlank` moves an `@empty` kept copy to a fresh `@new-` id (no work is lost; a later 6d "Not saved yet" list will show it). `?effect=@empty` opens that id; `?new=empty` still opens another new effect. Done once per page load.
- **Buttons centred.** `.editor-name-dialog-actions` is `justify-content: center`, for NameDialog and the prompt (the prompt reuses the class).
- **Checks.** New `graph-editor:kept-copy` (silent restore and `data-unsaved`, Revert, prompt with default focus, Escape, Load saved, two new effects, legacy migration, first Save, centred buttons in both Modals). `graph-editor:top-bar` now asserts no banner and no Restore/Discard, then Revert; `title-menu` lists Revert to saved; `gate` no longer clicks Discard; `lib/editorMenu.mjs` `setName` treats any `@` id as unsaved-new. Unit tests: `history.test.ts` (open outcomes, re-base, legacy, migration, `isUnsaved`), `e4.test.ts` (`newEffectId`).

## Verification

- `web/graph-editor`: `npm run typecheck` clean, `npm test` 173 passed, `npm run build` clean.
- All 21 `graph-editor:*` checks plus the new one pass except `graph-editor:error-shell`, which stops at its agent light-test row on this machine. It fails the same way with this bead's changes stashed (the app binary in `build/mac-app` dates from 2026-11-12 09:05), so it is not from 6b.

## Lessons

- none
