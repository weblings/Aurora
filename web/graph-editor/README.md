# Aurora graph editor

React Flow editor for node graphs, served by Aurora's HTTP server at
`/graph-editor/`. Vite + React + TypeScript; built by CMake and embedded in the
binary when `AURORA_ENABLE_GRAPH_EDITOR` is ON (the app presets set it; needs
Node >= 22.12; see `cmake/GraphEditor.cmake`). The Dashboard's "Edit graph"
link (`web/ui`, `graphEditorHref`) opens it with `?effect=<running effect>`. Plan and decisions: [[sequence-e-planning]],
[[node-graph-pipeline]].

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
- `src/Palette.tsx` -- the add-node list (`graph/palette.ts` groups catalog
  types by prefix); click adds at the view centre, a drop adds at the pointer.
- `src/useDraftLoop.ts` -- sends the draft and holds the preview stream;
  `ZoneThumbnail.tsx` draws its frames from a ref, not state.
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

A built-in is never overwritten: Save, Save and apply and Keep write it under a
new id slugged from the Name box (`save.ts`) and then open that effect. A
custom effect is saved over its own id. Keep is `/api/graph/test/confirm`, so
the server refuses it once the draft differs from the tested graph; the button
is disabled by the same comparison.
