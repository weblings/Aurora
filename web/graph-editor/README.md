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
tested on a phone, and touch is not a goal of this pass.

## Layout

- `src/graph/` -- pure, React-free: `types.ts` (catalog and graph shapes),
  `doc.ts` (edits: each returns a new document), `flow.ts` (graph.json <-> React
  Flow), `layout.ts` (saved `ui` positions, else columns by topological depth),
  `connection.ts` (the wiring rules), `history.ts` (undo reducer),
  `autosave.ts` (browser backup of unsaved edits), `problems.ts` (server errors
  regrouped per node/port/param), `loop.ts` (draft/preview states), `frame.ts`
  (preview events), `lightTest.ts` (test-on-lights states), `controls.ts`
  (the Dashboard `controls` list), `save.ts` (new effect ids). `fixtures.ts` + `graph.test.ts` are the
  Vitest suite.
- `src/GenericNode.tsx`, `src/ParamWidget.tsx` -- one node component draws any
  `/api/nodes` entry; one widget per param kind.
- `src/AddNodeMenu.tsx` -- the cascade Add node menu (`+` button, Shift+A): group flyouts, or a ranked search list; `graph/addMenu.ts` has the grouping and ranking. A pick adds at the view centre.
- `src/useDraftLoop.ts` -- sends the draft and holds the preview stream;
  `ZoneThumbnail.tsx` draws its frames from a ref, not state, placing the
  active output's zones at their `/api/zones` uv regions (grid for the rest).
- `src/TitleMenu.tsx`, `ViewMenu.tsx`, `ProblemsChip.tsx`, `Toast.tsx` -- the top bar's popups and the toast, all on `EditorPopup`. `graph/status.ts` picks the one status line and the banner from the priority rule in `docs/planning/WebUI/GraphEditorCleanup.md`.
- `src/EditorPopup.tsx` -- the shared popup layer over Grille's `Popover`.
- `src/useLightTest.ts` -- heartbeat, countdown and holder polling for a test;
  `Inspector.tsx` -- node details and the Dashboard controls list.
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
custom effect is saved over its own id. A test shows Revert only; Save and apply
during one applies, then reverts, because apply alone leaves the test running
(the revert rebuilds the just-applied effect from disk).

Menus go through `EditorPopup.tsx`, which holds the React Flow workarounds (keys,
pane drag, Esc, focus return). Use it for any new menu.
