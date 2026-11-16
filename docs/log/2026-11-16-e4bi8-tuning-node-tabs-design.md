# Graph editor: Details and controls panel as one drawer with Tuning and Node tabs (design, ready to mock)

Id: e4bi8-tuning-node-tabs-design

`Aurora-e4bi.8`, design session with the owner, settled in ASCII sketches and ready for a mock. Follows [[e4bi1-controls-panel-mock]]. Plan: [[graph-editor-cleanup]] Stage 10. Nothing in the shipped editor or the mock changed.

## Problem

- Details and the controls panel share one drawer slot (`App.tsx` `drawer: 'details' | 'controls'`) and both edit a control. Label (Details field vs Rename), Section (field vs Move to section) and Remove (untick vs Remove) live in both. Add (the tick) and Tooltip live only in Details, so arranging the Dashboard means leaving the list.
- "Details" names nothing, and the drawer swap gives no sign the other view exists.
- The Details mock (`DetailsMock` in `ControlsPanelMock.tsx`) is the old drawer: plain title and x head (no count, menu or rule), body on `editor.css` `.drawer-details` with `--aurora-space-*` and fallback px, native checkboxes, ports as a prose list, a filled `--aurora-surface-selected` block on the target param.

## Prior art (web research)

- Unity Shader Graph: Blackboard lists, orders and groups exposed properties; the Graph Inspector has Node Settings and Graph Settings tabs, and a property picked in the Blackboard or on the canvas shows the same settings. Window menu opens panels.
- Blender: the node editor sidebar is tabbed. Node tab (name, label, properties) beside the Group tab (Group Sockets: add, reorder, edit exposed inputs and panels).
- ComfyUI: one right panel that switches on selection. Nothing selected shows Workflow Overview with favorited inputs (favorite from an input's action menu, reorderable, no grouping); a node selected shows its Parameters, Info, Settings tabs.
- Unreal Material Editor: Group and Sort Priority set per parameter node in Details, plus a Parameters window; long-standing requests to reorder in the list itself.
- Houdini (parameter pane vs Type Properties, promote by drag, one level per asset) and TouchDesigner (Parameter dialog vs Component Editor) split per-node params from the interface editor in separate windows.

## Direction (owner, 2026-11-16)

- Variants weighed: A two drawers with Details cut down; B one drawer with tabs; C a Unity-style single form opened from a card; D ComfyUI-style panel that follows the selection; E Details dissolved onto the node (param ticks on the node, purpose in an (i) tooltip). Picked B, with C kept as a shortcut. D rejected: the selection yanks the list away and undoes the click model. E out of stage 10 scope, maybe later as an extra add path.
- One drawer, two tabs: **Tuning** and **Node**. Not "Dashboard": the editor's back link already says Dashboard (`App.tsx` `editor-back`), and the Dashboard's own accordion for these controls is titled Tuning (`DashboardScreen.js`). "Expose" stays free for sub-graph interfaces. Tabs are fixed and switched by the user, never by the selection. The Node tab follows the canvas selection as Details does.
- Each field has one home. Tuning owns everything about a control once it exists: Edit, order, Move to section, Remove. Node owns what the node is and which params are in Tuning.
- C as a shortcut: the card menu's Rename... becomes **Edit...**, opening an "Edit control" state of the shared naming dialog with two labelled fields, Label (placeholder the param's own label, empty removes the key) and Tooltip (multi-line). Section, the source line and Remove were cut from the form: Move to section, the card tooltip, Show on node and the card menu cover them. Sections keep Rename.... Visible field labels when a dialog has more than one field.
- Node tab: title and purpose, then PORTS and PARAMS as plain headings, no collapsing (catalog sample: median 2 ports and 1 param, max 6 ports on Audio features and 7 params on Bar and Beat bounce; sample from a worktree copy of `server-samples/nodes.json`, may be stale). Port rows plain (direction, name, type), description and wired peer in the tooltip. Param rows outlined like cards without grip or menu, label plus the Dashboard's `.toggle-switch` (`forms.css`, ported from RockyRoad, as in Tuning's "Use fixed hue"), a "Tuning" column label, accessible name "Show <param> in Tuning". No values: the node on the canvas shows and edits them. A ticked param's tooltip names its Tuning label and section; double-click opens Edit control.
- Row rule: outlined with grip and menu = you own its order and text; outlined without grip = one action; plain = reference.
- Entry points: corner button opens Tuning; canvas menu Details and Show on the Dashboard open Node (the latter focuses the first switch); double-click or Enter on a card still selects the node and fits; switching on a param appends its card to General.
- Restyle with the panel: head pattern, `--ui-*` tokens, node-id subtitle dropped.

## Sub-graphs (1.2.1, `Aurora-g5mz`)

- A sub-graph node's ports and params come from its interface, which has the same shape as Tuning (an ordered, sectioned list of exposed params with labels and tooltips). Build the Tuning list as a generic exposed-param Tree taking its source as input, and keep Node tab rows per-param, so both carry over.
- Decide now (the controls shape freezes with /api/v1 in 1.2.0): a Tuning control points at a top-level node, for a sub-graph its exposed param, one level at a time, so `{node, param}` stays flat. Not yet recorded on `Aurora-g5mz`.
- Where the interface editor lives is open. Options sketched: a third tab only inside a sub-graph, or the Node tab showing the sub-graph's interface when nothing is selected. The owner found the click-away version potentially confusing and raised a Unity-style Window menu (a prior proposal had a View menu beside Edit) that opens panels as tabs in the drawer: Tuning and Node by default, the interface opened on demand. Caution: the canvas corner already has a View menu (zoom, fit, minimap; `ViewMenu.tsx`), so a top-bar menu needs another name or must absorb it.

## Open for the mock

- Tab labels with the count, `...` and x at 281 px and in the bottom dock head.
- Grille gaps: `TextField` has no multi-line form (props are label, value, onChange, id), and Grille has no Checkbox or Switch (the Node tab uses Aurora's `.toggle-switch` meanwhile).
- Touch: port descriptions and the Tuning-label line sit in tooltips with no hover on touch.
- Whether switching a param on shows a toast pointing at the new card.
- The Window or panels menu, its name and items.

## Verification

- Design only. Code read: `DetailsDrawer.tsx`, `DetailsMock` and `ControlFields` in the mock, `editor.css` drawer rules, `forms.css` toggle switch, `ViewMenu.tsx`, `EditMenu.tsx`, `graph/types.ts`. Grille dev.16 exports read from `node_modules`.
