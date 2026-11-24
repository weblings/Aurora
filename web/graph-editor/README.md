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
  `autosave.ts` (browser backup of unsaved edits: one kept copy per effect id, with the fingerprint of the saved graph it was made from; `openKept` says restore, nothing, or newer), `problems.ts` (server issues
  regrouped per node/port/param, worded by `web/ui/problemCopy.js`: our words keyed by issue code, the server's text for a code not listed, also used for refused test starts in `api.ts`; `Aurora-u8jx.1`), `loop.ts` (draft/preview states), `frame.ts`
  (preview events), `lightTest.ts` (test-on-lights states), `controls.ts`
  (the Dashboard `controls` list), `save.ts` (effect ids: the title slug, and `@new-<random>` for a new effect until its first Save). `fixtures.ts` + `graph.test.ts` are the
  Vitest suite.
- `src/GenericNode.tsx`, `src/ParamWidget.tsx` -- one node component draws any
  `/api/nodes` entry; one widget per param kind.
- `src/recipes/`, `recipes.html`, `vite.recipes.config.ts` -- the recipes page (`Aurora-4g4d.2`, [[4g4d2-recipes-page]]), built apart from the editor (`npm run build:recipes` into `dist-recipes/`, never embedded in the binary). It draws `docs/recipes/*.clip.json` with the editor's own `GenericNode`, `ParamWidget`, `toFlowNodes`, `toFlowEdges` and `ViewMenu` inside `ReadOnlyContext` (inputs disabled, node menu hidden, no minimap item), after a measured second layout pass (`layered` in `graph/layout.ts`). Grille `Tabs` pick the recipe (a `Menu` on phones), an Outline switch swaps the graph for a generated SVG (`outline.ts`, turned 90 degrees under 650 px), the text list stays in the page for assistive tech, and Copy (`copyClip.ts`) has a select-and-copy fallback. `recipes.test.ts` is the drift test and `tools/browser-check/checks/recipes-page.mjs` drives the built page. See [[effect-recipes]].
- `src/AddNodeMenu.tsx` -- the cascade Add node menu (the `+ Add node` canvas button top-left, Shift+A): group flyouts, or a ranked search list; `graph/addMenu.ts` has the grouping and ranking. A pick adds at the view centre.
- Canvas corners (`Aurora-s1t7.3`): Add node top-left, the View menu bottom-left with the minimap stacked above it (the menu anchors to the View button and opens over the map, sharing its left edge and width), React Flow's credit bottom-centre. Tuning has no corner button (`Aurora-e4bi.12`, below). A half-height dock lifts the bottom corners, a full-height one hides them (CSS in `editor.css`, `tools/browser-check`'s `graph-editor:corners`).
- `src/useDraftLoop.ts` -- sends the draft and holds the preview stream (`?layout=` picks a sim, see below);
  `PreviewIsland.tsx` is the top-right Preview island (`Aurora-s1t7.4`, `Aurora-u8jx.6.1`): one whole-row
  Preview button that hides the rest (kept for the session), a layout menu button (the shared tick `Menu`, as
  `SplitTestButton`), then one 14 px DOM cell per zone, 8 per row, no screen mapping and no resize. It never
  hides while the stream is live. Colours are written to the cells from a ref on animation frames, not through
  state. The button caps at 28ch with a tooltip only when cut off (`useCutOff`, since Grille's Button lacks
  `tooltipOnlyWhenTruncated`).
- Preview layouts (`Aurora-u8jx.6.1`): `graph/previewLayout.ts` holds the rules and `usePreviewLayout.ts` the
  state. Lights (named after the Hue entertainment area when known, cached for a downed bridge), Sim: your room
  (the saved zone map, left out when none) and Sim: basic room (4 quadrants, `basicRoomZoneMap()`, equal to the
  web demo's `ROOM_ZONE_MAP` and `tools/fake-hue-bridge/room-4zone-zonemap.json`, each checked by a test). A
  sim is editor-preview only: core draws it in `GraphPreview` (`GET /api/graph/preview?layout=room|basic`,
  `GET /api/graph/preview/layouts` for the saved-zone count) and sends nothing. No reachable lights (the shell's
  `output_link` row) picks a sim for the user and disables Test with a reason. A running test pulls the island to
  the real layout and locks the menu. Switches nobody asked for go through the Announcer, user picks do not.
- `src/TitleMenu.tsx`, `ViewMenu.tsx`, `ProblemsChip.tsx`, `Toast.tsx` -- the top bar's popups and the toast, all on `EditorPopup` (`Toast` is editor-local: `useToast().show(text, { doc, run })` adds a Grille Undo button, 8 s instead of 3, the timer held while hovered or focused; any change of the document other than `doc` spends it; `Aurora-u68h.6`) (its `focusAfter` names where focus goes when a choice closes the popup: the chip after a refused Save, a problem's node after a row pick). `ProblemsChip` also hosts the refused-save callout and ping (`Aurora-u68h.4`). `graph/status.ts` `pickStatus` picks the Test button's own state (its label or tooltip) from the priority rule in [[graph-editor-cleanup]]; every other message has its own home listed there, and the bar has no status text. There is no banner under the bar. `SplitTestButton.tsx` is the Test split button (`Aurora-qjqy.3`): `Test (15s)`/`Test (Live)`/`Stop 0:12`/`Stop`/`Take over`/`Reconnect`, the caret menu picks Once (15 s) or Live and starts it, the current mode is marked with Grille's single-selection look (`menuitemradio`). `header[data-preview]` carries the state label for the browser checks.
- `src/ContextMenu.tsx` -- right-click menus for the canvas, a node and a wire, anchored at a point; the node menu also opens from each node's `⋯` button and Shift+F10 (`Aurora-daaa.27.1`).
- Clipboard (`Aurora-ge1i.2.1`): `graph/doc.ts` `copySelection`/`parseClip`/`pasteSelection`/`pasteNote` are pure. The system clipboard holds marked JSON (`aurora-graph-clip`), so a paste works in another tab. App binds Ctrl/Cmd+A, C, X on keydown (canvas and bar only, not text boxes, popups or drawers) and V through the `paste` event, so no clipboard permission is needed there. The menu Paste reads the clipboard and toasts when it is denied. A repeat paste of the same clip steps 24 px down and right. `graph/keys.ts` holds the platform key hints.
- `src/Hint.tsx` -- hover help (`Aurora-w6zq.8`): Grille's `Tooltip` around any element (React Aria's `Focusable` makes it a tab stop; several lines render as a list). No `title=` on nodes, ports, params or toolbar buttons; menu rows carry help as their summary line, not a tooltip (React Aria needs a focusable trigger). The Test group takes the tooltip when Test is off, since a disabled button sends no pointer events.
- `src/EditorPopup.tsx` -- the shared popup layer over Grille's `Popover`. Menu items pad like the bar's buttons (`.ui-popover .ui-menu-item` in `editor.css`, a Grille gap: its item is 6/12, its small button 6/10), and a right-anchored popup (Test) is `width: max-content` so it opens in place instead of re-measuring (`Aurora-u8jx.4.3`).
- `src/Announcer.tsx` -- `useAnnouncer()` and `<Announcer>`: the visually hidden `role="status"` live region for announce-only messages (`Aurora-u68h.3`); call `announce(text)`, draw nothing (Stop's `Reverted` and `Added <type>` use it too, `Aurora-u68h.6`). A test that ended for a reason the user did not cause is announced here (`graph/status.ts` `testOutcome`; the Test caret menu carries no line, `Aurora-u8jx.4.2`); a lost heartbeat is also a toast (`quietEndToast`); a refused start is a toast.
- `src/useLightTest.ts` -- heartbeat and countdown for this tab's test (who else holds the lights is `useHostState`'s);
  `ControlsDrawer.tsx` -- Tuning, in a Grille drawer. The node menu's "Tuning controls…" opens `TuningPicker.tsx` (`Aurora-e4bi.9`): a non-modal popover beside the node with a `.toggle-switch` per param (on adds to General, off is Remove with the undo toast). A Tuning control's param row shows a muted dot (`TuningMarksContext`, `.param-in-tuning`), and `TapHint.tsx` shows port and param descriptions on a touch tap. `TuningPanel.tsx` is Tuning's card list (`Aurora-e4bi.3`): a React Aria Tree of one graph level's controls (read-only section headings), each card with a `...` menu (Edit..., Move up, Move down, Move to section, Show on node, Remove); Show on node, double-click and Enter select the node, fit the view and ping the param's row (`pingParam.ts`, `data-param`/`data-ping`). `graph/tuningCards.ts` holds the menu rules (the Inspector is gone, `Aurora-daaa.27.4`). Drawer chrome (`Aurora-e4bi.12`): the head is the title, count and `...` menu (Grille `hideControls`: no x, no full-height button). `GrabTab.tsx` is a tab on the drawer's inner edge in every state (2 px borders) and the only way to reopen it: docked, a click toggles half and full, a drag or Up and Down step closed, half, full, and full stops 24 px (`GRAB_TAB`) below the top bar; beside a side drawer the pill stands upright and a click, a drag or Left and Right hide and show it. Hide Tuning in the `...` menu is the one-click close (WCAG 2.5.7). A bare `T` on the canvas toggles Tuning (App's key handler: not in a field, popup, dialog or the drawer, no modifiers; Ctrl+J and Ctrl+B are browser keys, and T cannot be typed into the Tree's type-ahead from the canvas), shown in the menu item and the tab's tooltip. `.editor-toast` sits left of a side drawer and above the dock (`--editor-top` on `.editor` is the canvas top), and above a full-height dock. Right-click or Shift+F10 on a param row's label or slider opens the param menu (Add to Tuning or Remove from Tuning, `paramMenu.ts`, `Aurora-e4bi.15`). Checks for Tuning: `graph-editor:drawers` (cards, Edit control dialog, In-Tuning dot), `graph-editor:tuning-sections`, `graph-editor:tuning-drag`, `graph-editor:drawer-chrome` (grab tab, Hide Tuning, T, toast above the dock), `graph-editor:context-menus` (picker and param menu at 1100 and 400 px) and `graph-editor:control-count` (ceilings 11 and 9).
- `src/useMedia.ts` -- the top bar shrinks by priority, never wraps (`Aurora-daaa.29.1`). Undo and Redo live in the Edit dropdown beside the title with Cut, Copy, Paste, Select all and Delete (`EditMenu.tsx`, `Aurora-ge1i.2.1`); unsaved changes are a dot on the title at every width; the bar collapses by stage when the title would fall under 100 px (`barStage.ts` tries each stage on the real bar and keeps the first that fits, so it has no hysteresis and no container query): 1 the back link is its arrow, 2 the Test split button (`Test (15s)`/`Test (Live)`) is its icon alone, 3 the problems chip is its count (`data-back-icon`, `data-test-icon`, `data-chip-compact` on the header; a missing chip is skipped); in that form its accessible name and tooltip carry the state: `Test (15s)`, `Stop the test, 12 seconds left`, `Take over the test`, `Reconnect`, and otherwise its name stays Test on lights; the Problems chip keeps its chevron at every width, `Aurora-u8jx.8`, `Aurora-u8jx.9.1`). `tools/browser-check`'s `graph-editor:narrow` asserts it at 1100, 900, 700, 520, 450, 420, 400 and 360 px.
- `editor.css` sets the drawer width to `clamp(280px, 40vw, 350px)` (`Aurora-daaa.29.2`). Below 650 px wide (`DOCK_BOTTOM` in `useMedia.ts`, width only, `Aurora-daaa.37`) the drawer docks at the bottom at half height with Grille's half/full toggle; otherwise they stay on the right (`Aurora-daaa.29.4`).
- `src/ErrorShell.tsx`, `useHostState.ts`, `graph/hostState.ts` -- the Dashboard's error shell (`Aurora-s1t7.9`): first element of the page, rows from `GET /api/state` (read at once, then every 3 s), `shell.css` styling, also the Dashboard's shell (`islands/main.tsx` `mountErrorShell`, fed by `web/ui/shell.js`), and the "Aurora has stopped" takeover. `useHostState`'s `reachable` is the one verdict the takeover and the Test button share. Editor-supplied rows (a refused draft PUT: 429 and 400; an effect that would not open, `openFailedNote`; a failed Save, Save as new or Save and apply, `failedSaveNote`: no Retry, cleared by the next Save or edit, and a network failure is the takeover only, `writeFailureReason`) ride beside the host rows; a 413 is a Whole graph problem. The light-test wording is `web/ui/testHolder.js`, shared.
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

The title menu is one `Menu`: Save, Save as new, Save and apply, Rename, Duplicate,
Revert to saved, Export graph (the whole graph as the clip JSON that paste accepts, downloaded by `graph/exportGraph.ts`, `Aurora-vtm5`), then New and Open submenus (`TitleMenu.tsx`), each ending in From file..., which opens a picked graph file as a new unsaved effect (`graph/importGraph.ts`, `Aurora-dzsd`). A graph file dropped on the window merges into the open graph at the drop point, or opens as a new effect when nothing is open (`useFileDrop.ts`, `DropFrame.tsx`). New lists the dashboard's
Start from choices flat; `graph/titleMenu.ts` `startPoints()` copies the rule of
`startPoints()` in `web/ui/EffectPanelModel.js` (keep in sync). Custom and Hidden
sub-menus follow (`startGroups()`, from the dashboard's `buildGroups`; Hidden holds hidden
custom effects, since hidden built-ins are flat). A New pick other than Empty, and
Duplicate, open an unsaved copy titled `X (Copy)` under a fresh `@new-` id
(`Aurora-ge1i.4`): `App.tsx` `openCopy` seeds the doc (`graph/save.ts` `copyOf`) and the
loader opens it over the blank baseline, so nothing is written until Save. Open lists
the other effects, Custom then Built-in, in Grille `MenuSection`s inside a scrolling
`SubmenuItem` and goes through `openEffect(id, where)` in `App.tsx`.

Kept copies (`Aurora-u68h.2`): an effect that opens with a kept copy gets it back silently (an edit on the saved graph, so one Undo reaches the saved version); nothing is asked and no toast shows. `data-unsaved` on the title button is the unsaved state; the trailing `*` after the name draws from it (`Aurora-ge1i.3`, below). Revert to saved (title menu, enabled when unsaved) puts the saved graph back as one history edit and drops the copy; its Undo toast runs the history undo, and the kept copy is written again with the edits. Load saved's Undo toast puts the kept edits back as an edit (it was not a history entry). Only when the saved effect changed since the copy was made does `NewerSavedPrompt.tsx` (a Grille Modal) ask: Load saved or Keep my edits (default focus, Escape). A New ▸ Empty effect gets `@new-<random>` as its id (URL and kept-copy key); its first Save gives it the title-slug id and the kept copy moves with it. A legacy `@empty` copy is moved to a fresh `@new-` id at page load.

Refused saves and unsaved marks (`Aurora-u68h.4`, `.8`, `Aurora-ge1i.3`): Save, Save as new and Save and apply are never disabled. While the chip counts any problem (node, Whole graph, "Draft would not load", draft_too_large) they write nothing, close the menu and point at the chip: focus moves to it, a `role="status"` callout on its left, or below it and wrapped when its one-line width does not fit between the chip and the title button's right edge plus 10 px (a 16 px gutter at least), keeping off the Add node button (measured in `ProblemsChip.tsx`, never a breakpoint; `Aurora-h55g`, `Aurora-u8jx.4.1`) (`Couldn't save. Fix N problems first.`, plain Save adds `Your changes are kept in this browser.`) lasts 4.2 s, and after 1.45 s the chip alone pings, ending as the callout closes (`PING_BEAT_MS`, `CALLOUT_MS` in `ProblemsChip.tsx`; reduced motion holds the border). The callout is Aurora's own element in Grille's tooltip look, because Grille's `Tooltip` is hover/focus-driven with `role=tooltip`. A problems row selects its node, fits the view and focuses the node; Enter on the chip focuses the first row. The unsaved mark is a trailing `*` (`<span class="editor-unsaved-mark" aria-hidden>`, never shrunk, so truncation cannot cut it; was Grille's `dotIcon` until `Aurora-ge1i.3`) on the title (the button's name becomes "Effect menu, unsaved changes"), after an Open ▸ Custom or Built-in item with a kept copy (MenuItem `description` "unsaved changes"), and at the end of the "Not saved yet" heading (the `@new-*` kept copies; their items carry no mark). `graph/titleMenu.ts` `openGroups` builds the groups from `graph/autosave.ts` `keptCopies`. Long Open ▸ titles use MenuItem `tooltip` + `tooltipOnlyWhenTruncated`.

Menus go through `EditorPopup.tsx`, which holds the React Flow workarounds (keys,
pane drag, Esc, focus return). Use it for any new menu.

## Icons (`Aurora-s1t7.5`)

Every icon in the editor is Grille's (`Icon` plus the `*Icon` data exports from `@weblings_things/grille`, `0.1.0-dev.13`), at `size="sm"`; nothing imports `web/ui/icons` or draws a Unicode glyph. This replaces the `Aurora-daaa.33` audit (2026-11-10/11), whose findings are all closed.

| Icon | Where |
| --- | --- |
| `arrowLeftIcon` | Back link |
| `chevronDownIcon` (Grille flips it while `aria-expanded`) | Title menu, View menu, Zones header, Test split caret |
| `playIcon` / `stopIcon` | Test split button (Test/Take over, Stop) |
| `undoIcon` / `redoIcon` | Top bar: icon buttons at every width, named by `aria-label`, so there is no More menu any more |
| `addIcon` | Add node button |
| `menuHorizontalIcon` | Node menu button |
| `warningIcon` | Problems chip, node badge, problem lists, port mark, param problems. Grille's warning is Zest's triangle-exclamation; Aurora's own `web/ui/icons/warning.svg` is not used by the editor |
| `minusIcon` | Gradient stop remove |

Cut or replaced by CSS: the `◆` "On the Dashboard" mark (owner, 2026-11-11), and the `●` unsaved dot, then Grille's `dotIcon`, now a text `*` (`Aurora-ge1i.3`). Grille's `Select` `▾` is Grille's own, not Aurora's to change (the Tuning drawer hides Grille's `Drawer` close `×` with `hideControls`).

The mock (`web/ui/Static_GraphEditor_Mocks_Grille/mock.js`) inlines the same Grille path data (`VS`, `ZEST`, `warnIcon`) because a static page cannot load the package.

### Crediting (not legal advice)

Grille's icons are Vidstack `media-icons` (MIT, Copyright (c) 2023 Rahim Alwer) and Zest Free (Copyright 2019-2021 32pixels, LLC). Aurora's built editor contains the paths, so the root `THIRD_PARTY_NOTICES.md` keeps both notices in full and says they arrive through Grille; the build also copies Grille's own notices to `dist/THIRD-PARTY-NOTICES.md`. `web/ui/icons` remains the Dashboard's folder and is not touched here.
