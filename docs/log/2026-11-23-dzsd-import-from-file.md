# Import a graph file from the Effect menu

Id: dzsd-import-from-file

`Aurora-dzsd` (open, P3; 1.2.1), part 1 of 2. New and Open each gain a From file... item. It opens a picked graph file as a new unsaved effect (`graph/importGraph.ts`, `App.tsx` `openFile`). Part 2, drop onto the canvas, is not built.

- Format: the file `exportFile` writes, the clip JSON that paste accepts. `parseClip` then `pasteSelection` into a blank doc, so wires, layout and Tuning controls come back.
- Destination: a new unsaved effect under a draft id, seeded like Duplicate. The open graph is never replaced, so no unsaved-edits prompt is needed.
- Title: from the file name (the export carries none), made distinct from the listed effects (`my-cool-effect.aurora-graph.json` gives "My cool effect").
- Errors are a toast and nothing opens: not an Aurora graph file, or Nothing to import with the reason when every node type is unknown here. Skipped nodes in a partial import are noted.
- Menu: item id `@from-file` (a draft id cannot collide with a stored effect). Open now always shows, since it always holds this item. A hidden file input in App does the picking, no permission prompt.
- Decision for part 2: a drop merges into the open graph like paste, and opens as a new effect when nothing is open. The design is in the bead.

## Verification
- `tsc --noEmit` clean, `vitest run` 366 passed, including `importGraph.test.ts` (export round trip, title from the file name and its distinct form, non-graph text, all-unknown types).
- The owner confirmed the menu path works in the browser.
- `graph-editor-title-menu.mjs` expectation was not changed because the root item list is the same. The check was not run.

## Lessons
- One vitest run failed every suite with `Cannot read properties of undefined (reading 'config')` right after a `tsc` run, and passed again on a later run with no change. Cause not found.
