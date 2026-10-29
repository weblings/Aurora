# Graph editor: Save as new picks a distinct title

Id: lut9-save-as-new-title

`Aurora-lut9`: Save as new took a fresh id but kept the title, so the effect
picker showed two rows with one name.

- `distinctTitle` in `graph/save.ts`: a title that matches an existing effect's
  (trimmed, case-insensitive) becomes `<title> copy`, then `copy 2`, ...; an
  unused title is kept. `write` applies it for `asNew` before taking the id, so
  the id follows the title (`foo-copy`, not `foo-2`).
- Vitest in `e4.test.ts` covers the three cases. Browser check
  `graph-editor-save-as-new.mjs` no longer renames the copy: it asserts the new
  title is `... copy` and the original keeps its own. Passes on the dev server.
- E0b's duplicate route was not touched; it is separate code.

- Lessons: none.
