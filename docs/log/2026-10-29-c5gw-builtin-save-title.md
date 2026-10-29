# Graph editor: saving a built-in picks a distinct title

Id: c5gw-builtin-save-title

`Aurora-c5gw`: Save / Save and apply on a built-in took its title from the Name
box, so a name matching an existing effect gave two picker rows with one title.

- `forWrite` in `graph/save.ts` applies `distinctTitle` to any write that makes
  a new effect (built-in or Save as new); overwriting a custom and Keep (the
  tested draft is already put) send the document unchanged. `write` uses it.
- Vitest in `e4.test.ts` covers the four cases.

- Lessons: none.
