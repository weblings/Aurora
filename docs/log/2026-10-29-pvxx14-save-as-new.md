# Graph editor: Save as new for customs

Id: pvxx14-save-as-new

`Aurora-pvxx.14`: Save on a custom always overwrote its own id, so a custom
could not be forked from the editor.

- `write(kind, asNew)` in `App.tsx`: `asNew` takes a fresh id from the Name box
  (`freshEffectId`) through the same `/api/graph/save`, then opens the new
  effect and clears the original's unsaved-edit cache. The button shows only
  on customs; Save already forks a built-in.
- No new id logic, so no new Vitest. Browser check
  `checks/graph-editor-save-as-new.mjs` (`npm run graph-editor:save-as-new`)
  passes on the dev server: the new effect has the added node, the original's
  `GET /api/effects/:id` and the live effect are unchanged.

- Lessons: none.
