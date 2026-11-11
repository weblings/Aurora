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
- `src/ContextMenu.tsx` -- right-click menus for the canvas, a node and a wire, anchored at a point; the node menu also opens from each node's `⋯` button and Shift+F10 (`Aurora-daaa.27.1`).
- `src/EditorPopup.tsx` -- the shared popup layer over Grille's `Popover`.
- `src/useLightTest.ts` -- heartbeat, countdown and holder polling for a test;
  `DetailsDrawer.tsx` and `ControlsDrawer.tsx` -- the node details and the Dashboard controls list, in Grille drawers (the Inspector is gone, `Aurora-daaa.27.4`).
- `src/useMedia.ts`, `src/BarMoreMenu.tsx`, `src/DesktopNote.tsx` -- the top bar shrinks by priority, never wraps (`Aurora-daaa.29.1`). Below 650 px Undo and Redo are icon buttons and Unsaved is a dot on the title; below 520 px the back link is its arrow, Undo and Redo move into a More (`⋯`) menu, and Test on lights reads Test (full name as tooltip and accessible name); below 600 px a dismissible desktop-window line shows (dismissal in `localStorage`). `tools/browser-check`'s `graph-editor:narrow` asserts it at 1100, 900, 700, 520 and 400 px.
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
custom effect is saved over its own id. A test shows Revert only; Save and apply
during one applies, then reverts, because apply alone leaves the test running
(the revert rebuilds the just-applied effect from disk).

Menus go through `EditorPopup.tsx`, which holds the React Flow workarounds (keys,
pane drag, Esc, focus return). Use it for any new menu.

## Icon audit (`Aurora-daaa.33`)

Audit only, no code changed. Checked 2026-11-10 against `src/`, the files it imports, Grille `0.1.0-dev.8` `dist/index.js` and the Grille mock.

Verified 2026-11-10 by diffing path data against `media-icons@0.10.0` (npm, MIT, "Copyright (c) 2023 Rahim Alwer"; the package's `raw/` folder has the SVGs). Exact path matches: `play`, `pause`, `chevron-down`, `chevron-up` and `back-arrow` (= Vidstack `arrow-left`). Redistribution needs that copyright notice and licence text kept in the repo (one `THIRD_PARTY` entry covers all of them). Names in verdicts are real `raw/` file names unless marked otherwise.

### SVG files the editor imports (from `web/ui/icons`)

| Icon | Where | Origin | Licence | Grid / style | Verdict |
| --- | --- | --- | --- | --- | --- |
| `back-arrow.svg` | `App.tsx` back link | No origin comment; added with the `web/ui` import (42cd39f1). **Confirmed Vidstack `arrow-left`** (identical path) | MIT (Vidstack), notice not in repo | 32x32, fill `#ffffff` hard-coded | Keep the shape; inline as a component on `currentColor`, add the notice |
| `chevron-down.svg` | `App.tsx`, `ViewMenu.tsx` | **Confirmed Vidstack `chevron-down`** | MIT, notice not in repo | 32x32, fill `#ffffff` hard-coded | Keep the shape; inline on `currentColor` |
| `chevron-up.svg` | `App.tsx`, `ViewMenu.tsx` | **Confirmed Vidstack `chevron-up`** | MIT, notice not in repo | 32x32, fill `#ffffff` hard-coded | Keep the shape; inline on `currentColor` |

All three hard-code white fill, so they only work on a dark surface and need an `<img>` (cannot follow `currentColor` or Grille theme tokens).

### Unicode glyphs standing in for icons

Render per OS font, so size, weight and baseline differ on Mac, Windows and Linux.

| Glyph | Where | Verdict |
| --- | --- | --- |
| `↶` `↷` | `App.tsx` Undo/Redo when `compactBar` | Vidstack has no undo/redo (`replay` and `rotate` are other shapes). Draw new on the 32 grid, fill, to match |
| `⋯` | `GenericNode.tsx` node menu, `BarMoreMenu.tsx` | Vidstack `menu-horizontal` (three dots) |
| `⚠` | `ProblemsChip.tsx`, `GenericNode.tsx` (header, list, port mark), `ParamWidget.tsx` | Vidstack has no warning icon (`info`, `question-mark` only). Use `web/ui/icons/warning.svg` as an inline component |
| `●` | `App.tsx` unsaved dot on the title (compact) | Keep: a plain dot; or a CSS circle so it does not depend on the font |
| `◆` | `ParamWidget.tsx` "On the Dashboard" mark | Vidstack has no diamond. Draw new, or a CSS shape |
| `↑` `↓` | `ControlsDrawer.tsx` move up/down | Vidstack `arrow-up` / `arrow-down` |
| `✕` | `ControlsDrawer.tsx` remove | Vidstack `x-mark` (same one as the Drawer close) |
| `−` | `ParamWidget.tsx` remove stop | Vidstack has no minus (`add` only). Draw new, matching `add` |

### Icons inside Grille (`dev.8`)

| Glyph | Where | Verdict |
| --- | --- | --- |
| `×` | `Drawer` close button, `index.js` | Grille's to fix; ask for an icon slot or module. Until then it is the font's `×` |
| `▾` | `Select` trigger, `index.js` | Same: font-dependent triangle, not the chevron used elsewhere |

### Not used by the editor (in `web/ui/icons`, for reference)

| File | Used by | Origin | Licence | Note |
| --- | --- | --- | --- | --- |
| `play-rockyroad.svg`, `pause-rockyroad.svg` | Dashboard (`DashboardScreen.js`), kep2 mocks | File comments say "adapted from RockyRoad v2/public/…" | **Confirmed Vidstack `play` / `pause`** (identical paths) | **Fix the comments**: credit Vidstack, drop or qualify the RockyRoad line |
| `power-svgrepo-com.svg` | Dashboard, kep2 mocks | SVG Repo ("Uploaded to" comment) | MIT-style Zest Free License (32pixels, LLC), now in `THIRD_PARTY_NOTICES.md` | Stroke icon (24 grid, 2px, `#ffffff`), a different style from the Vidstack fills. Keep, or replace for style |
| `warning.svg` | Not imported anywhere in the editor today | Redrawn in `Aurora-xrl1` (5da5bd79); no source recorded | Unrecorded, presumed Aurora's own | 34x29, `currentColor`, stroke plus fill. The only one that follows text colour |

### Needed by `Aurora-daaa.32` (mock only)

| Icon | Where | Proposed |
| --- | --- | --- |
| Play `▷` | Test split button at rest | Vidstack `play` (a filled triangle, not the outline `▷`) |
| Stop `■` | Test split button while testing | Vidstack `stop` |
| Chevron | Split button menu, Zones hide | Vidstack `chevron-down` / `chevron-up` |
| Fullscreen / exit | Zones island corner toggle | Vidstack `fullscreen-arrow` / `fullscreen-arrow-exit` (or `arrow-expand` / `arrow-collapse`) |

The mock's chevrons and warning mark are inline SVG; its play, stop and corner toggle are not yet drawn as icons.

RockyRoad (`~/Documents/Coding/RockyRoad/public`) holds the same Vidstack back-arrow, chevrons, play and pause, plus `check.svg`, `replay.svg` and app-specific icons; nothing there covers the glyphs above. RockyRoadImport has no SVGs.

### Crediting (not legal advice)

MIT requires the copyright notice and permission text to travel with every copy or substantial portion. So:

- **Grille ships Vidstack icons:** Grille's package must carry the Vidstack notice (Copyright (c) 2023 Rahim Alwer, MIT text). That covers Grille's own distribution.
- **Aurora should credit as well.** Aurora's built editor contains the icon paths, and Aurora also holds its own copies today in `web/ui/icons`. A Grille credit in `node_modules` does not reach someone who gets only the built app. Normal practice is one third-party notices file listing every bundled MIT component, including those that arrive through dependencies.
- **RockyRoad does not cover Aurora.** Its `src/shared/assets/MediaSVGSource.txt` is one line ("In-lined svg's from: https://vidstack.io/icons/?lib=react"): a source link, no copyright line or MIT text. It has the same gap.
- **Aurora today:** the root `README.md` Art section links to Vidstack and Zest. A link is a credit, not the licence text.
- **Done (2026-11-10):** `THIRD_PARTY_NOTICES.md` at the repo root now holds the full Vidstack and Zest notices (Zest: "Copyright 2019-2021 32pixels, LLC", from `zest-icons`) and the Huenicorn entry, linked from the root README. Still to do: Grille keeps the same notice in its own package, and Aurora's file notes icons that arrive through Grille.

### Findings

1. Three sources, no module: files in `web/ui/icons`, Unicode glyphs, and Grille's own glyphs.
2. Licences are known (Vidstack MIT, Zest MIT-style) and the full notices are now in the root `THIRD_PARTY_NOTICES.md`.
3. Wrong credit: `play-rockyroad.svg` and `pause-rockyroad.svg` comments.
4. The editor imports from `../../ui/icons` (the Dashboard's folder), so a rename or cleanup there breaks the editor.
5. Suggested next step: one `icons` module for the editor with inline SVG components on `currentColor` (24 or 32 grid, one fill style), Vidstack where it has the shape, drawn new for undo, redo, minus and the dashboard diamond, plus the Aurora warning mark; add a `THIRD_PARTY` licence entry. Ask Grille for an icon slot on `Drawer` close and `Select`.
