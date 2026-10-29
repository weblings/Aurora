# Graph editor: node palette

Id: pvxx13-node-palette

`Aurora-pvxx.13`: the editor could delete nodes but not add them.

- `addNode` in `graph/doc.ts`: id from the type's last segment (`gain`,
  `gain-2`, ...), every param at its catalog default, position saved in `ui`
  (rounded). One history entry per add.
- `Palette.tsx` (left of the canvas) lists `/api/nodes` types grouped by type
  prefix (`graph/palette.ts`), purpose as the hover title. Click adds at the
  canvas centre; dragging an item onto the canvas adds at the drop point.
- Vitest: unique id, defaults, `ui`, one history entry, adapter round trip,
  grouping. Browser check `checks/graph-editor-add-node.mjs`
  (`npm run graph-editor:add-node`) passes on the dev server: add Gain, wire
  from `ease_hue`, preview Live with no problems, Save, reopen shows the node.
- Not checked in a browser: the drag-and-drop path (only the click path).

- Lessons: none.
