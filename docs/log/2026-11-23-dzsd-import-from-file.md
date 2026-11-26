# Import a graph file: menu and drop

Id: dzsd-import-from-file

`Aurora-dzsd` (closed, P3; 1.2.1). Part 1: New and Open each gain a From file... item. It opens a picked graph file as a new unsaved effect (`graph/importGraph.ts`, `App.tsx` `openFile`). Part 2: a graph file dropped on the window (`useFileDrop.ts`, `App.tsx` `dropFiles`).

- Format: the file `exportFile` writes, the clip JSON that paste accepts. `parseClip` then `pasteSelection` into a blank doc, so wires, layout and Tuning controls come back.
- Destination: a new unsaved effect under a draft id, seeded like Duplicate. The open graph is never replaced, so no unsaved-edits prompt is needed.
- Title: from the file name (the export carries none), made distinct from the listed effects (`my-cool-effect.aurora-graph.json` gives "My cool effect").
- Errors are a toast and nothing opens: not an Aurora graph file, or Nothing to import with the reason when every node type is unknown here. Skipped nodes in a partial import are noted.
- Menu: item id `@from-file` (a draft id cannot collide with a stored effect). Open now always shows, since it always holds this item. A hidden file input in App does the picking, no permission prompt.
- Drop: with a graph open the file merges at the drop point through `pasteText`, so it is one undo step with the new nodes selected and skipped types noted. With nothing open it opens as a new effect like the menu. More than one file or a non-graph file is a toast and no change.
- The listeners are on the window and act only on drags that carry files (`hasFiles`), and cancel `dragover` and `drop` so a miss does not navigate the tab.
- Hint (`DropFrame.tsx`, `dashFit.ts`): a dark scrim and a dashed rounded frame centred on the canvas left over (below the header, clear of a Tuning drawer, like the toast), 70% by 60% of it capped at 640 by 320 px, and 90% by 88% capped at 1400 by 900 px from 900 px wide. The frame is the right half of the outline drawn as a path plus its mirror, radius 10, 6 px stroke, one dash wrapping each corner as long as the others and the stretches between fitted to a whole number of dashes. CSS dashed borders and an SVG rect with `pathLength` gave uneven corners ([[lesson-layout-css]]).
- Another session's commit `ad8cf6b0` (`Aurora-4nqt.1`) swept the staged drop work in under its own message. The history has no separate dzsd commit for it.

## Verification
- `tsc --noEmit` clean, `vitest run` 375 passed, including `importGraph.test.ts` (export round trip, title from the file name and its distinct form, non-graph text, all-unknown types, a merge into an open graph), `useFileDrop.test.ts` and `dashFit.test.ts`.
- New browser check `graph-editor-import.mjs` (`npm run graph-editor:import`, added to the editor set and the browser-check README) passed on the fake-Hue stack: the Export graph download, New > From file and Open > From file opening it as an unsaved effect titled from the file name, a non-graph file refused with a toast, the drop hint for a dragged file and not for text and gone on dragleave, `dragover` cancelled, a drop merging into the open graph with the skipped output node noted, and a non-graph or two-file drop changing nothing. The nothing-open drop was not covered.
- The owner confirmed the hint in the browser at desktop and phone width. The dash fit math was also checked in node for three box sizes.
- `graph-editor-title-menu.mjs` now expects the File section in the Open flyout and From file... last in New. That check fails earlier, at "Esc returns focus to the trigger" (line 48), the same with the pre-change `TitleMenu.tsx` and without the file input, so the new expectations were not reached. It was not run after `Aurora-vtm5` either.
- `graph-editor-clipboard.mjs` fails at the Edit menu order: the menu now holds Tidy (`Aurora-kp8y`, not this bead). Not changed here.
- Viz port 8000 was held by a ComfyUI instance, so the checks ran with `AURORA_VIZ_PORT=8001`. The stack was down afterwards.

## Lessons
- [[lesson-layout-css]]: a dashed rounded frame needs fitted dashes, a mirrored half outline and one dash per corner.
- [[lesson-web-testing]]: a drop is tested by dispatching a DragEvent with a File in a DataTransfer, and port 8000 can belong to another app (`AURORA_VIZ_PORT`).
- vitest failed every suite on many runs with `Cannot read properties of undefined (reading 'config')` and passed again later with no change. Cause not found, so no lesson filed.
