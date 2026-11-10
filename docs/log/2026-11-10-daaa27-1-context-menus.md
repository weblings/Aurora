# Graph editor: right-click and ⋯ menus

Id: daaa27-1-context-menus

`Aurora-daaa.27.1`. Canvas, node and wire menus, first slice of stage 4 (`Aurora-daaa.27`).

## State

- `ContextMenu.tsx`: one popup on `EditorPopup`, keyed on the anchor point. Canvas: Add node (group cascade, node placed at the pointer), Undo, Redo, Fit view. Node: Details, Show on the Dashboard, Delete (acts on the selection, says the count). Wire: Delete connection (hit area 24 px via `interactionWidth`).
- Keyboard routes: a `⋯` button on every node ("Actions for <title>", `aria-haspopup=menu`, faded but always rendered), and Shift+F10 / Menu key on a focused node. Nodes carry `ariaLabel` from their title.
- A node menu opened on an unselected node selects it alone first.
- Details and Show on the Dashboard only select the node until the drawers exist (`Aurora-daaa.27.3`).

## Verification

- `tsc`, Vitest (118) and build pass. New `graph-editor:context-menus` browser check passes; add-menu, top-bar, title-menu and add-node checks still pass.
- Wire menu: a synthetic `contextmenu` event did not open it, a real right-click at the path midpoint did. The check uses the real click.
- Not checked: VoiceOver on the `⋯` button; wire menu on a stacked or very short wire.

## Lessons

- Lessons: none.
