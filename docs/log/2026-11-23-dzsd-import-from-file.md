# Import a graph file: menu and drop

Id: dzsd-import-from-file

`Aurora-dzsd` (open, P3; 1.2.1). Part 1: New and Open each gain a From file... item. It opens a picked graph file as a new unsaved effect (`graph/importGraph.ts`, `App.tsx` `openFile`). Part 2: a graph file dropped on the window (`useFileDrop.ts`, `App.tsx` `dropFiles`).

- Format: the file `exportFile` writes, the clip JSON that paste accepts. `parseClip` then `pasteSelection` into a blank doc, so wires, layout and Tuning controls come back.
- Destination: a new unsaved effect under a draft id, seeded like Duplicate. The open graph is never replaced, so no unsaved-edits prompt is needed.
- Title: from the file name (the export carries none), made distinct from the listed effects (`my-cool-effect.aurora-graph.json` gives "My cool effect").
- Errors are a toast and nothing opens: not an Aurora graph file, or Nothing to import with the reason when every node type is unknown here. Skipped nodes in a partial import are noted.
- Menu: item id `@from-file` (a draft id cannot collide with a stored effect). Open now always shows, since it always holds this item. A hidden file input in App does the picking, no permission prompt.
- Drop: with a graph open the file merges at the drop point through `pasteText`, so it is one undo step with the new nodes selected and skipped types noted. With nothing open it opens as a new effect like the menu. More than one file or a non-graph file is a toast and no change.
- The listeners are on the window and act only on drags that carry files (`hasFiles`), and cancel `dragover` and `drop` so a miss does not navigate the tab.
- Hint (`DropFrame.tsx`, `dashFit.ts`): a dark scrim and a dashed rounded frame centred on the canvas left over (below the header, clear of a Tuning drawer, like the toast). The frame is the right half of the outline drawn as a path plus its mirror, with one dash wrapping each corner and the stretches between fitted to a whole number of dashes. CSS dashed borders and an SVG rect with `pathLength` gave uneven corners.

## Verification
- `tsc --noEmit` clean, `vitest run` 375 passed, including `importGraph.test.ts` (export round trip, title from the file name and its distinct form, non-graph text, all-unknown types, a merge into an open graph), `useFileDrop.test.ts` and `dashFit.test.ts`.
- The owner confirmed the menu path and the drop hint in the browser (desktop and phone width). The merge, the nothing-open drop and a non-graph drop were not recorded.
- The dash fit math was checked directly in node for three box sizes (half outline sums exactly). Open: the arcs read slightly large and a dash might fit before each corner.
- `graph-editor-title-menu.mjs` expectation was not changed because the root item list is the same. The check was not run.

## Lessons
- From the drop work on, vitest failed every suite on many runs with `Cannot read properties of undefined (reading 'config')` right after a `tsc` run, and passed again on a later run with no change. Cause not found.
