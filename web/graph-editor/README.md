# Aurora graph editor

React Flow editor for node graphs, served by Aurora's HTTP server at
`/graph-editor/`. Vite + React + TypeScript; built by CMake and embedded in the
binary when `AURORA_ENABLE_GRAPH_EDITOR` is ON (the app presets set it; needs
Node >= 22.12; see `cmake/GraphEditor.cmake`). The Dashboard's "Edit graph"
link (`web/ui`, `graphEditorHref`) opens it with `?effect=<running effect>`. Plan and decisions: [[sequence-e-planning]],
[[node-graph-pipeline]], [[graph-editor-cleanup]].

## Scope

Desktop only for the cleanup pass (`Aurora-daaa`, decision 5): the top bar, menus
and right-click menus are designed for a pointer and keyboard. The editor has never been
tested on a phone, and touch is not a goal of this pass. Narrow desktop windows
(~700 px) and a phone fallback that does not break are in scope (`Aurora-daaa.29`;
Decisions, narrow windows, in [[graph-editor-cleanup]]).

## Layout

- `src/graph/` -- pure, React-free: `types.ts` (catalog and graph shapes),
  `doc.ts` (edits: each returns a new document), `flow.ts` (graph.json <-> React
  Flow), `layout.ts` (saved `ui` positions, else columns by topological depth),
  `connection.ts` (the wiring rules, and `insertConverter`: a Float/Angle drop gets an `angle.fromFloat`/`angle.toFloat` node, `Aurora-0veq`), `history.ts` (undo reducer),
  `autosave.ts` (browser backup of unsaved edits: one kept copy per effect id, with the fingerprint of the saved graph it was made from; `openKept` says restore, nothing, or newer), `problems.ts` (server errors
  regrouped per node/port/param), `loop.ts` (draft/preview states), `frame.ts`
  (preview events), `lightTest.ts` (test-on-lights states), `controls.ts`
  (the Dashboard `controls` list), `save.ts` (effect ids: the title slug, and `@new-<random>` for a new effect until its first Save). `fixtures.ts` + `graph.test.ts` are the
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
- `src/TitleMenu.tsx`, `ViewMenu.tsx`, `ProblemsChip.tsx`, `Toast.tsx` -- the top bar's popups and the toast, all on `EditorPopup` (`Toast` is editor-local: `useToast().show(text, { doc, run })` adds a Grille Undo button, 8 s instead of 3, the timer held while hovered or focused; any change of the document other than `doc` spends it; `Aurora-u68h.6`) (its `focusAfter` names where focus goes when a choice closes the popup: the chip after a refused Save, a problem's node after a row pick). `ProblemsChip` also hosts the refused-save callout and ping (`Aurora-u68h.4`). `graph/status.ts` `pickStatus` picks the Test button's own state (its label or tooltip) from the priority rule in [[graph-editor-cleanup]]; every other message has its own home listed there, and the bar has no status text. There is no banner under the bar. `SplitTestButton.tsx` is the Test split button (`Aurora-qjqy.3`): `Test (15s)`/`Test (Live)`/`Stop 0:12`/`Stop`/`Take over`/`Reconnect`, the caret menu picks Once (15 s) or Live and starts it, the current mode is marked with Grille's single-selection look (`menuitemradio`). `header[data-preview]` carries the state label for the browser checks.
- `src/ContextMenu.tsx` -- right-click menus for the canvas, a node and a wire, anchored at a point; the node menu also opens from each node's `⋯` button and Shift+F10 (`Aurora-daaa.27.1`).
- `src/Hint.tsx` -- hover help (`Aurora-w6zq.8`): Grille's `Tooltip` around any element (React Aria's `Focusable` makes it a tab stop; several lines render as a list). No `title=` on nodes, ports, params or toolbar buttons; menu rows carry help as their summary line, not a tooltip (React Aria needs a focusable trigger). The Test group takes the tooltip when Test is off, since a disabled button sends no pointer events.
- `src/EditorPopup.tsx` -- the shared popup layer over Grille's `Popover`. Menu items pad like the bar's buttons (`.ui-popover .ui-menu-item` in `editor.css`, a Grille gap: its item is 6/12, its small button 6/10), and a right-anchored popup (Test) is `width: max-content` so it opens in place instead of re-measuring (`Aurora-u8jx.4.3`).
- `src/Announcer.tsx` -- `useAnnouncer()` and `<Announcer>`: the visually hidden `role="status"` live region for announce-only messages (`Aurora-u68h.3`); call `announce(text)`, draw nothing (Stop's `Reverted` and `Added <type>` use it too, `Aurora-u68h.6`). A test that ended for a reason the user did not cause is announced here (`graph/status.ts` `testOutcome`; the Test caret menu carries no line, `Aurora-u8jx.4.2`); a lost heartbeat is also a toast (`quietEndToast`); a refused start is a toast.
- `src/useLightTest.ts` -- heartbeat and countdown for this tab's test (who else holds the lights is `useHostState`'s);
  `DetailsDrawer.tsx` and `ControlsDrawer.tsx` -- the node details and the Dashboard controls list, in Grille drawers (the Inspector is gone, `Aurora-daaa.27.4`).
- `src/useMedia.ts` -- the top bar shrinks by priority, never wraps (`Aurora-daaa.29.1`). Undo and Redo are icon buttons at every width; unsaved changes are a dot on the title at every width; below 520 px the back link is its arrow (the Test split button is `Test (15s)`/`Test (Live)` at every width; its accessible name stays Test on lights). `tools/browser-check`'s `graph-editor:narrow` asserts it at 1100, 900, 700, 520 and 400 px.
- `src/graph/clear.ts` -- the pan rule that keeps the selected node clear of the Details drawer (one axis, so the bottom dock can reuse it); `App` runs it on open, on a new selection and on canvas resize. `editor.css` sets the drawer width to `clamp(280px, 40vw, 350px)` (`Aurora-daaa.29.2`). Below 650 px wide or portrait (aspect under 0.75, `DOCK_BOTTOM` in `useMedia.ts`) both drawers dock at the bottom at half height with Grille's half/full toggle, and the pan rule runs against the dock's top edge; otherwise they stay on the right (`Aurora-daaa.29.4`).
- `src/ErrorShell.tsx`, `useHostState.ts`, `graph/hostState.ts` -- the Dashboard's error shell (`Aurora-s1t7.9`): first element of the page, rows from `GET /api/state` (read at once, then every 3 s), `shell.css` markup held equal to `web/ui/shell.js` by `ErrorShell.test.tsx`, and the "Aurora has stopped" takeover. `useHostState`'s `reachable` is the one verdict the takeover and the Test button share. Editor-supplied rows (a refused draft PUT: 429 and 400; an effect that would not open, `openFailedNote`; a failed Save, Save as new or Save and apply, `failedSaveNote`: no Retry, cleared by the next Save or edit, and a network failure is the takeover only, `writeFailureReason`) ride beside the host rows; a 413 is a Whole graph problem. Keep the markup in step with `shell.js`; the light-test wording is `web/ui/testHolder.js`, shared.
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

The title menu is one `Menu`: Save, Save as new, Save and apply, Rename, then
New and Open submenus (`TitleMenu.tsx`). New lists the dashboard's Start from
choices; `graph/titleMenu.ts` `startPoints()` copies the rule of `startPoints()` in
`web/ui/EffectPanelModel.js` (keep in sync). Open lists the other effects, Custom
then Built-in, in Grille `MenuSection`s inside a scrolling `SubmenuItem`. Both go
through `openEffect(id, where)` in `App.tsx`.

Kept copies (`Aurora-u68h.2`): an effect that opens with a kept copy gets it back silently (an edit on the saved graph, so one Undo reaches the saved version); nothing is asked and no toast shows. `data-unsaved` on the title button is the unsaved state; the dot beside the name draws from it (`Aurora-u68h.4`, below). Revert to saved (title menu, enabled when unsaved) puts the saved graph back as one history edit and drops the copy; its Undo toast runs the history undo, and the kept copy is written again with the edits. Load saved's Undo toast puts the kept edits back as an edit (it was not a history entry). Only when the saved effect changed since the copy was made does `NewerSavedPrompt.tsx` (a Grille Modal) ask: Load saved or Keep my edits (default focus, Escape). A New ▸ Empty effect gets `@new-<random>` as its id (URL and kept-copy key); its first Save gives it the title-slug id and the kept copy moves with it. A legacy `@empty` copy is moved to a fresh `@new-` id at page load.

Refused saves and unsaved dots (`Aurora-u68h.4`, `.8`): Save, Save as new and Save and apply are never disabled. While the chip counts any problem (node, Whole graph, "Draft would not load", draft_too_large) they write nothing, close the menu and point at the chip: focus moves to it, a `role="status"` callout on its left, or below it and wrapped when its one-line width does not fit between the chip and the title button's right edge plus 10 px (a 16 px gutter at least), keeping off the Add node button (measured in `ProblemsChip.tsx`, never a breakpoint; `Aurora-h55g`, `Aurora-u8jx.4.1`) (`Couldn't save. Fix N problems first.`, plain Save adds `Your changes are kept in this browser.`) lasts 4.2 s, and after 1.45 s the chip alone pings, ending as the callout closes (`PING_BEAT_MS`, `CALLOUT_MS` in `ProblemsChip.tsx`; reduced motion holds the border). The callout is Aurora's own element in Grille's tooltip look, because Grille's `Tooltip` is hover/focus-driven with `role=tooltip`. A problems row selects its node, fits the view and focuses the node; Enter on the chip focuses the first row. The unsaved dot is `<Icon icon={dotIcon} size="sm" />` on the title (the button's name becomes "Effect menu, unsaved changes"), after an Open ▸ Custom or Built-in item with a kept copy (MenuItem `description` "unsaved changes"), and at the end of the "Not saved yet" heading (the `@new-*` kept copies; their items carry no dot). `graph/titleMenu.ts` `openGroups` builds the groups from `graph/autosave.ts` `keptCopies`. Long Open ▸ titles use MenuItem `tooltip` + `tooltipOnlyWhenTruncated`.

Menus go through `EditorPopup.tsx`, which holds the React Flow workarounds (keys,
pane drag, Esc, focus return). Use it for any new menu.

## Icons (`Aurora-s1t7.5`)

Every icon in the editor is Grille's (`Icon` plus the `*Icon` data exports from `@weblings/grille`, `0.1.0-dev.13`), at `size="sm"`; nothing imports `web/ui/icons` or draws a Unicode glyph. This replaces the `Aurora-daaa.33` audit (2026-11-10/11), whose findings are all closed.

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
| `dotIcon` | The unsaved-changes dot: title, Open ▸ items, the "Not saved yet" heading (`Aurora-u68h.4`/`.8`) |

Cut or replaced by CSS: the `◆` "On the Dashboard" mark (owner, 2026-11-11), and the `●` unsaved dot, now Grille's `dotIcon` (no CSS dot). Grille's `Drawer` close `×` and `Select` `▾` are Grille's own, not Aurora's to change.

The mock (`web/ui/Static_GraphEditor_Mocks_Grille/mock.js`) inlines the same Grille path data (`VS`, `ZEST`, `warnIcon`) because a static page cannot load the package.

### Crediting (not legal advice)

Grille's icons are Vidstack `media-icons` (MIT, Copyright (c) 2023 Rahim Alwer) and Zest Free (Copyright 2019-2021 32pixels, LLC). Aurora's built editor contains the paths, so the root `THIRD_PARTY_NOTICES.md` keeps both notices in full and says they arrive through Grille; the build also copies Grille's own notices to `dist/THIRD-PARTY-NOTICES.md`. `web/ui/icons` remains the Dashboard's folder and is not touched here.
