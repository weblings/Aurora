# Export graph in the graph editor

Id: vtm5-export-graph

`Aurora-vtm5` (closed, P3; 1.2.1). The Effect menu gains Export graph, after Revert to saved. It downloads the open graph as `<title-slug>.aurora-graph.json` (`graph/exportGraph.ts`).

- Format: the clip JSON that paste already accepts (`copySelection` over every node), so an export pastes back as the same graph. It carries nodes, wires, layout and Tuning controls only, not the title or other document fields. Nodes with no saved layout take the canvas positions.
- Download: a Blob and an anchor with `download`, with no permission prompt (the `showSaveFilePicker` route is Chromium-only). The item is disabled when no effect is open, and App announces "Exported N nodes".
- Icon: the bead asked for a download icon, and Grille v0.2.2-dev.1 ships `downloadIcon`. The owner had it removed because no other title menu row has an icon, so the menu stays uniform.
- Import was not part of this change. It came later in `Aurora-dzsd`: New and Open > From file, and a file dropped on the window ([[dzsd-import-from-file]]).
- The editor now pins Grille v0.2.2-dev.1 from GitHub, through the `tools/grille` switch (`Aurora-bnpx`, still open). Nothing in this change needs that version once the icon is gone, so the pin can return to npm with `npm run grille -- release`.

## Verification
- `tsc --noEmit` clean, `vitest run` 361 passed, including `exportGraph.test.ts` (file name from the title, and a custom and a built-in graph exported, parsed and pasted into a blank graph with the same node types, params and wires).
- The menu was shown in a browser against the fake-Hue stack and the Vite dev server. A download and a paste back were not recorded.
- `graph-editor-title-menu.mjs` now expects the Export graph item. That check was not run.

## Lessons
- none
