# Aurora graph editor

React Flow editor for node graphs, served by Aurora's HTTP server at
`/graph-editor/`. Vite + React + TypeScript; built by CMake and embedded in the
binary when `AURORA_ENABLE_GRAPH_EDITOR` is ON (the app presets set it; needs
Node >= 22.12; see `cmake/GraphEditor.cmake`). The Dashboard's "Edit graph"
link (`web/ui`, `graphEditorHref`) opens it with `?effect=<running effect>`. Plan and decisions: [[sequence-e-planning]],
[[node-graph-pipeline]].

## Scope

Desktop only for the cleanup pass (`Aurora-daaa`, decision 5): the top bar, menus
and right-click menus are designed for a pointer and keyboard. The editor has never been
tested on a phone, and touch is not a goal of this pass. Narrow desktop windows
(~700 px) and a phone fallback that does not break are in scope (`Aurora-daaa.29`;
Decisions, narrow windows, in `docs/planning/WebUI/GraphEditorCleanup.md`).

## Layout

- `src/graph/` -- pure, React-free: `types.ts` (catalog and graph shapes),
  `doc.ts` (edits: each returns a new document), `flow.ts` (graph.json <-> React
  Flow), `layout.ts` (saved `ui` positions, else columns by topological depth),
  `connection.ts` (the wiring rules, and `insertConverter`: a Float/Angle drop gets an `angle.fromFloat`/`angle.toFloat` node, `Aurora-0veq`), `history.ts` (undo reducer),
  `autosave.ts` (browser backup of unsaved edits), `problems.ts` (server errors
  regrouped per node/port/param), `loop.ts` (draft/preview states), `frame.ts`
  (preview events), `lightTest.ts` (test-on-lights states), `controls.ts`
  (the Dashboard `controls` list), `save.ts` (new effect ids). `fixtures.ts` + `graph.test.ts` are the
  Vitest suite.
- `src/GenericNode.tsx`, `src/ParamWidget.tsx` -- one node component draws any
  `/api/nodes` entry; one widget per param kind.
- `src/AddNodeMenu.tsx` -- the cascade Add node menu (the `+ Add node` canvas button top-left, Shift+A): group flyouts, or a ranked search list; `graph/addMenu.ts` has the grouping and ranking. A pick adds at the view centre.
- Canvas corners (`Aurora-s1t7.3`): Add node top-left, Dashboard controls bottom-right, the View menu bottom-left with the minimap stacked above it (the menu anchors to the View button and opens over the map, sharing its left edge and width), React Flow's credit bottom-centre. A side drawer moves Dashboard controls left of it; a half-height dock lifts the bottom corners, a full-height one hides them (CSS in `editor.css`, `tools/browser-check`'s `graph-editor:corners`).
- `src/useDraftLoop.ts` -- sends the draft and holds the preview stream;
  `ZonesIsland.tsx` is the top-right Zones island (`Aurora-s1t7.4`): a header
  with a hide chevron (kept for the session), then one 14 px DOM cell per zone
  of the single active output (the one `/api/zones` names), 8 per row, no screen
  mapping and no resize. Colours are written to the cells from a ref on
  animation frames, not through state.
- `src/TitleMenu.tsx`, `ViewMenu.tsx`, `ProblemsChip.tsx`, `Toast.tsx` -- the top bar's popups and the toast, all on `EditorPopup`. `graph/status.ts` places each state (the Test button's label, the banner, or a toast) from the priority rule in [[graph-editor-cleanup]]; the bar has no status text. `SplitTestButton.tsx` is the Test split button (`Aurora-qjqy.3`): `Test`/`Stop 0:12`/`Stop`/`Take over`/`Reconnect`, the caret menu picks Once (15 s) or Live and starts it, the last pick is the default. `header[data-preview]` carries the state label for the browser checks.
- `src/ContextMenu.tsx` -- right-click menus for the canvas, a node and a wire, anchored at a point; the node menu also opens from each node's `⋯` button and Shift+F10 (`Aurora-daaa.27.1`).
- `src/EditorPopup.tsx` -- the shared popup layer over Grille's `Popover`.
- `src/useLightTest.ts` -- heartbeat, countdown and holder polling for a test;
  `DetailsDrawer.tsx` and `ControlsDrawer.tsx` -- the node details and the Dashboard controls list, in Grille drawers (the Inspector is gone, `Aurora-daaa.27.4`).
- `src/useMedia.ts`, `src/DesktopNote.tsx` -- the top bar shrinks by priority, never wraps (`Aurora-daaa.29.1`). Undo and Redo are icon buttons at every width; below 650 px Unsaved is a dot on the title; below 520 px the back link is its arrow (the Test split button is `Test` at every width; its accessible name stays Test on lights); below 600 px a dismissible desktop-window line shows (dismissal in `localStorage`). `tools/browser-check`'s `graph-editor:narrow` asserts it at 1100, 900, 700, 520 and 400 px.
- `src/graph/clear.ts` -- the pan rule that keeps the selected node clear of the Details drawer (one axis, so the bottom dock can reuse it); `App` runs it on open, on a new selection and on canvas resize. `editor.css` sets the drawer width to `clamp(280px, 40vw, 350px)` (`Aurora-daaa.29.2`). Below 650 px wide or portrait (aspect under 0.75, `DOCK_BOTTOM` in `useMedia.ts`) both drawers dock at the bottom at half height with Grille's half/full toggle, and the pan rule runs against the dock's top edge; otherwise they stay on the right (`Aurora-daaa.29.4`).
- `src/api.ts` -- the only server calls (`/api/nodes`, `/api/effects`,
  `/api/effects/:id`, drafts, preview URL, test, save, apply). Paths are root-absolute on purpose (Aurora's API ignores
  the editor's base); asset URLs are built from `import.meta.env.BASE_URL`.

## Invariants

- The graph is one JSON document held in `App` state (with its undo history,
  `history.ts`); every edit replaces it. Param widgets edit "live" and call
  `commit` when the gesture ends, so a slider drag is one undo step.
  Keys the editor does not edit (`version`, `tickHz`, `controls`, node extras,
  `ui` entries that are not node ids) must survive. Positions reach the
  document only when a drag ends.
- `refuseConnection` copies the loader's rules in
  `core/Runtime/src/Graph/GraphLoader.cpp` (exact port type, one edge per
  input, no cycles, one sender per output). Change them together.
- Theme comes from `web/ui/styles/tokens.css`; dark only, like the WebUI.

## Commands

`npm run dev` (hot reload; `AURORA_PORT=<port>` points `/api` at a running
Aurora), `npm run typecheck`, `npm test`.

## Saving

Save, Save as new and Save and apply are in the title menu ("Effect menu"
button). A built-in is never overwritten: Save and Save and apply write it under
a new id slugged from the Name box (`save.ts`) and then open that effect. A
custom effect is saved over its own id. A test shows Stop only; Save and apply
during one applies, then reverts, because apply alone leaves the test running
(the revert rebuilds the just-applied effect from disk).

Menus go through `EditorPopup.tsx`, which holds the React Flow workarounds (keys,
pane drag, Esc, focus return). Use it for any new menu.

## Icons (`Aurora-s1t7.5`)

Every icon in the editor is Grille's (`Icon` plus the `*Icon` data exports from `@weblings/grille`, `0.1.0-dev.10`), at `size="sm"`; nothing imports `web/ui/icons` or draws a Unicode glyph. This replaces the `Aurora-daaa.33` audit (2026-11-10/11), whose findings are all closed.

| Icon | Where |
| --- | --- |
| `arrowLeftIcon` | Back link |
| `chevronDownIcon` (Grille flips it while `aria-expanded`) | Title menu, View menu, Zones header, Test split caret |
| `playIcon` / `stopIcon` | Test split button (Test/Take over, Stop) |
| `undoIcon` / `redoIcon` | Top bar: icon buttons at every width, named by `aria-label`, so there is no More menu any more |
| `addIcon` | Add node button |
| `menuHorizontalIcon` | Node menu button |
| `warningIcon` | Problems chip, node badge, problem lists, port mark, param problems. Grille's warning is Zest's triangle-exclamation; Aurora's own `web/ui/icons/warning.svg` is not used by the editor |
| `arrowUpIcon` / `arrowDownIcon` / `xMarkIcon` | Controls drawer reorder and remove |
| `minusIcon` | Gradient stop remove |

Cut or replaced by CSS: the `◆` "On the Dashboard" mark (owner, 2026-11-11), and the `●` unsaved dot, now `.editor-dirty-mark`, a CSS circle. Grille's `Drawer` close `×` and `Select` `▾` are Grille's own, not Aurora's to change.

The mock (`web/ui/Static_GraphEditor_Mocks_Grille/mock.js`) inlines the same Grille path data (`VS`, `ZEST`, `warnIcon`) because a static page cannot load the package.

### Crediting (not legal advice)

Grille's icons are Vidstack `media-icons` (MIT, Copyright (c) 2023 Rahim Alwer) and Zest Free (Copyright 2019-2021 32pixels, LLC). Aurora's built editor contains the paths, so the root `THIRD_PARTY_NOTICES.md` keeps both notices in full and says they arrive through Grille; the build also copies Grille's own notices to `dist/THIRD-PARTY-NOTICES.md`. `web/ui/icons` remains the Dashboard's folder and is not touched here.
