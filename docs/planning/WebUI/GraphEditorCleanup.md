# Graph editor cleanup

Id: graph-editor-cleanup

Status: stage 1 built (back link, Aurora component styles); stage 2 built (top bar, title and view menus, status spot, `Aurora-daaa.11`); stage 3 built (catalog `group`, node copy, cascade Add node menu, palette removed; `Aurora-daaa.24.1`-`.24.4`, Grille `v0.1.0-dev.6`); stage 4 built (right-click and ⋯ menus, Delete key, Details and Dashboard controls drawers, Inspector removed, Esc closes a drawer from anywhere; `Aurora-daaa.27.1`-`.27.5`, Grille `v0.1.0-dev.8`). Control count 9 on Screen colors and `builtin.audio`, under the mock's 11. Narrow windows built: top bar shrink (`Aurora-daaa.29.1`), drawer width and node-clear pan (`Aurora-daaa.29.2`), bottom dock (`Aurora-daaa.29.4`), 1100 px no-pan check and drawer-body container queries skipped (`Aurora-daaa.29.5`). Full graph-editor browser-check suite passes on the stage 4 head (`Aurora-daaa.30`). Stage 5 built (`Aurora-s1t7`, editor to the Grille mock: Grille buttons and 32 px bar `.1`, problems chip before Undo `.2`, canvas corners and minimap `.3`, Zones island `.4`, side-drawer fix `Aurora-daaa.35`, Grille icons `.5`, Decisions `.6`/`.7`). Light test modes built (`Aurora-qjqy`: Once (15 s) and Live in core `.1`, MCP `try_on_lights` defaults to Once `.2`, Test split button `.3`). Stage 6 (`Aurora-u68h`, each message in its own place) and stage 7 (`Aurora-u8jx`, problems in people's words) are filed: see Stages 5 and 6, and Decisions (owner, stage 6 scope, 2026-11-12). Grille `v0.1.0` (`Aurora-daaa.16`, `Grille-0up`) stays the end of the whole process, after the UX refinement, outside stages 5 and 6.
Written 2026-11-06 under `Aurora-bova`. The owner reviewed the working mock and likes
the direction. Decisions 1-7 are recorded under Decisions (2026-11-08). Stages 1-2 are
built; stages 3-4 are still a proposal and follow those decisions.
The 2026-11-08 spikes (`Aurora-t2hz`, `Aurora-m5kl`) support building the popups on
Grille (`weblings/GrilleDS`), which adds prerequisite work in that repo before stage 2.

Reference mock: `web/ui/Static_GraphEditor_Mocks/` (open `index.html`). Layout, menus
and states in this doc refer to its frames. Background: [[sequence-e-planning]],
[[nodes-agent-ux]].

## Problem

The editor works, but it shows everything at once and does not look like Aurora.
Measured on the fake-Hue stack at 1470x900:

| Measure | Today | Mock |
|---|---|---|
| Chrome controls always visible, Screen colors | 84 | 11 |
| Chrome controls always visible, `builtin.audio` | 132 | Not mocked |
| Fitted graph zoom at 1470x900 | 37% | 70% |
| Fitted graph zoom at 1280x720 | 30% | 60% |
| Route back to the Dashboard on the page | None | `← Dashboard` |
| Mouse route to delete a node or wire | None | Right-click menu |

- Control counts come from `npm run graph-editor:control-count` (rule in the
  check's header): rendered buttons, inputs, selects, textareas and links outside
  canvas nodes, 1470x900. It supersedes the earlier hand counts (82 / 130, and
  97 / 160 in the stage 1 log); each stage lowers the check's ceiling.
- The two largest sources are the Add node list (53 buttons) and the Dashboard
  controls (18 inputs for video, 66 for audio).
- The canvas gets 59% of the window, and nine status slots are spread across the
  header, action row and canvas.
- The editor imports Aurora's color tokens but no component styles. Controls fall
  back to Arial, Add node buttons are unstyled light browser defaults, and the brand
  mark is a purple dot, a placeholder from the initial editor build, in an otherwise
  grayscale product.
- Only Backspace deletes today. The Delete key is not bound.

## Proposal

**Layout.** A full-width canvas under one top bar. Always visible: `← Dashboard`, the
effect title, status, undo and redo, Test on lights and Save. Four small canvas
controls stay on screen: Add node, zone preview, Dashboard controls and the view menu.

**Moved behind menus.**

- The effect selector and Name box merge into one title menu.
- Save, Save as new and Rename move into the title menu (no split button on Save). Save and apply joins them. Keep after a test goes away: see Decisions.
- Zoom, fit and the minimap move to a view menu, with the minimap off by default.
- Node details and the Dashboard controls move into drawers that close.
- Status messages become one status spot, short toasts and a problems chip.

**Add node menu.** One searchable menu for the `+` button, a keyboard shortcut and
canvas right-click. Three forms are mocked (see open direction 1). Shared content:

- Seven signal-based groups in place of code prefixes: Sources, Audio, Image, Color,
  Numbers, Motion and Lights.
- Rows show input and output sockets, which separates the two `Hue shift` nodes.
- Name matches rank first, and description matches sit under their own heading.
- The catalog's `useWhen` text is shown for the first time.

**Right-click menus.** Canvas: Add node, Undo, Redo, Fit view. Node: Details, Show on
the Dashboard, Delete. Wire: Delete connection. A selected node also shows a visible
`⋯`, and Shift+F10 opens the same menu. Touch long-press failed on iPhone and was cut
from the effect panel ([[kep224-cut-long-press]]), so right-click is never the only route.

**Styling.** Stage 1 imports `forms.css` from `web/ui`. It has no page-wide element rules,
so importing it should be safe. `dropdown.css` styles `Dropdown.js`'s custom menu, so it
comes in only for the hand-built fallback, or if its trigger style suits the native
selects. `page.css` stays out. From
stage 2, popups come from Grille's React Aria wrappers (see Scoping concerns). Node params
stay native on `forms.css`, since Grille has no number, color or checkbox control.

- The editor keeps its `--aurora-*` names. Grille's `--ui-*` tokens load beside them, and
  the shared values match.
- Grille's warning and error tones add color, so the status spot and toasts don't use them.
- Port colors stay, since they carry meaning.

## Prior art

| Editor | Pattern | Relevance |
|---|---|---|
| Unity Shader Graph | Searchable category tree, wire-drop list filtered by type, toolbar-toggled panels | Closest model for the menu and for hideable panels |
| ComfyUI | Search with type filters and a node preview, link release opens a menu | Preview pane. Filter before capping results ([issue 20696](https://github.com/Comfy-Org/ComfyUI_frontend/issues/20696)) |
| Blender | A picked node follows the pointer, main sockets rank first | Model for ghost placement |
| Unreal Blueprint | Context Sensitive toggle, wire drops filter by pin type | A way out of filtering, for wire-drop search |
| Houdini, TouchDesigner | One key opens the menu, few stable families | Fast keyboard path, small set of groups |
| n8n | `+` on the canvas or a node, list changes with graph state | Possible sources-first empty graph |

## Open directions

These change the shape of the work and need an owner decision.

### 1. Add node menu form

| Form | Strength | Cost |
|---|---|---|
| A: Browser | Group rail, list and preview, so a node can be learned before adding it | Largest popup, 760x460 |
| B: Cascade | Compact, reads like a context menu. Search sits on top, so it is search-first too | No port preview beside the list (the purpose line and a tooltip carry the text, as in C), and flyouts need Grille submenus |
| C: Side sheet | Stays open for adding several, uses the accordion look | A panel again, which works against the goal |

Recommendation: A, optionally with a pin to keep it open.

Decided: B (see Decisions, 2026-11-09).

### 2. Who owns the node groups

The catalog has no category field, so the mock's groups are a hand-written map.

- **Editor map:** small and fast, but it lives apart from the node definitions. A new
  node needs an `Other` fallback and a test that flags it.
- **Catalog field:** one source of truth that agents also get through `list_nodes`, but
  it touches every node registration, `/api/nodes`, `/api/v1`, MCP and the server samples.

Recommendation: start with the editor map, and promote it only if agents or other
consumers need the groups.

Decided: a catalog field named `group` (see Decisions, 2026-11-09). The cost was
smaller than estimated above: `NodeTypeMeta` already carries per-node metadata, so it is
one line per registration plus the places that copy the meta out.

### 3. One text for people and agents, or two

The menu puts `purpose` and `useWhen` in front of users for the first time, and some
of it reads like developer notes ("today's subsampleWidth", `Absent`, `output.send`).
The MCP server sends that same `purpose` text to agents, where precise wording helps.
Some params also have no label.

Either rewrite shared text so it works for both audiences, or add user-facing text
beside it. Rewriting is smaller, but it changes what agents read and needs a check that
agent results hold up. This also settles vocabulary, such as `Lights` as the group name
while the port type stays `Frame`.

Decided: two texts, written in stage 3 (see Decisions, 2026-11-09).

### 4. How far the node itself changes

The mock restyles nodes and keeps params on them, as Unity, Blender and ComfyUI do.
Nodes with many params get tall: Hue ramp image has seven. Options are to keep all
params on the node, collapse secondary ones, or move them to the drawer. The choice also
sets how much room is left for per-node previews (`Aurora-h6yz`).

Recommendation: keep params on nodes for now, add a collapse later if real graphs need it.

Decided: params stay on nodes (see Decisions, stage 4).

### 5. Is touch or narrow width a target

The effect panel was tested on an iPhone. The editor never has been, and the mock is
desktop-first. Declaring it desktop-only keeps the work smaller. Supporting touch adds
real work on wiring, pan and selection, well beyond menu access. The visible `⋯` keeps
the door open either way.

Recommendation: desktop-only for this pass, stated plainly in the editor README.

Decided: touch stays out, but narrow desktop windows and a usable phone fallback are in
(see Decisions, narrow windows).

### 6. Effect switching and leaving

- **Effect switcher:** keep it in the title menu, or make the Dashboard the only place
  to pick an effect. Recommendation: keep it for now, since comparing effects while
  editing is useful. Removing it later is easy, and it must not switch on arrow keys.
- **Leaving with unsaved edits:** the browser backup already keeps them and offers
  Restore on return. A warning on `← Dashboard` adds safety and a little friction. The backup
  is per browser, so edits made in one browser are not offered in another.
  Recommendation: no warning, but say in the toast or title that edits are kept here.
  *Revised 2026-11-12:* the kept copy now restores without asking, with Revert to saved
  in the title menu; see Decisions (owner, stage 6 scope, 2026-11-12).

## Scoping concerns

**The mock did not cover every real state.** These exist today. Each now has a frame in the
`Gaps` group (`Aurora-daaa.6`), listed here as the original gaps:

- Restore or Discard for an unsaved copy from an earlier visit
- Take over the lights when another session holds the test
- Keep disabled because the graph changed since the test started
- Reconnect after the preview stream is replaced
- Naming a built-in before Save. The mock's Save skips this, and Save will probably
  need to open the title menu with the Name box focused.
- Cannot reach Aurora, and a graph-wide problem with no node to point at

**The mock has been proven on one graph.** Screen colors is a straight chain of eight
nodes. The audio built-in has twice the node controls and 66 Dashboard inputs, and a
larger custom graph may not fit at a readable zoom. Check both before calling the layout
done. Default layout may become its own piece of work.

**Consolidating status is more than a layout change.** Nine slots become one spot, which
needs a priority rule. Toasts disappear, so errors and test outcomes that need action must
stay on screen. This is the most likely place to lose information without noticing.

Frames for the states above are in the mock's `Gaps` group (`Aurora-daaa.6`): `#restore`,
`#takeover`, `#changed`, `#reconnect`, `#name`, `#offline`, `#wholegraph`. The rule is next.

### Status priority rule

*Rewritten 2026-11-11 (`Aurora-qjqy.3`); was: one status line in the bar. The bar has no status text now: the
Test split button, the banner and the toast carry what the pill said.*

*Stage 6 (2026-11-12) retires the banner and moves its rows elsewhere; see Decisions (owner, stage 6 scope, 2026-11-12). This table is rewritten when stage 6 closes (`Aurora-u68h.7`).*

**Three places, so nothing shares a spot it cannot afford to lose.**

- **Test split button** (in the bar): its label and tooltip are the state of the lights and the preview connection.
  `Test` at rest, `Stop 0:12` during Once, `Stop` during Live, `Take over` when another session holds the lights,
  `Reconnect` when another view took the preview. Problems and Cannot reach Aurora disable it, with the reason as the tooltip.
- **Banner** (one line under the bar): what blocks work, waits for an answer, or failed and needs a look.
  At most one at a time, in rank order.
- **Toast** (3 s, bottom center): only for a success or a minor refusal that the user caused
  a moment ago and that needs nothing further. A toast never carries the only copy of an error.

Fixed spots keep state out of the contest: `Unsaved` beside the title, the problems chip, `Edited since the test`,
and the Zones island's stale tint. They show alongside everything else.

Rank, highest first. `graph/status.ts` `pickStatus` returns the first active row and where it shows.

| Rank | State | Where | Persists until |
|---|---|---|---|
| 1 | Cannot reach Aurora, or cannot open the effect | Banner with Retry. Test button disabled, tooltip `Cannot reach Aurora` | Aurora answers |
| 2 | Restore or Discard an earlier copy | Banner with both buttons. Backup is held until answered | The user picks one |
| 3 | Draft not sent, draft would not load | Banner, reason after the colon | The next draft goes through |
| 4 | Preview taken over | The button reads `Reconnect` | Reconnect, or the stream returns |
| 5 | Lights in use by another session | The button reads `Take over`, tooltip names the holder | The holder finishes, or the user takes over |
| 6 | A test or write that failed or ended unexpectedly (heartbeat lost, another effect chosen, lights paused, a taker, start or Save failure, reload error) | Banner, plain words, latest wins | The next test, Save, or edit |
| 7 | Preview state: connecting, paused, closed, live | Nowhere. The chip says problems, the Zones island tints when stale | It changes |
| - | A Once test reached 15 s, Stop, Reverted | Toast (`Test finished: the lights are back`, `Reverted`) | 3 s |
| - | Wire refused (`Those ports do not match`) | Toast | 3 s. It names its own cause, and the wire simply did not land |
| - | Saved, Saved and live, Restored, Discarded, Added node | Toast | 3 s. The bar's `Unsaved` and the title already show the new state |

Rules that follow:

1. **Errors and outcomes that need action never go to a toast.** Ranks 1-6 persist.
2. **A new item of equal rank replaces the old one**, since both are the same kind of news.
   A higher rank shown over a lower one does not erase it: the lower returns when the higher resolves.
3. **Problems with the graph are a chip, not a status.** The chip counts every problem,
   node-level and graph-wide. Its popover lists them; a node-level row selects the node, and a
   graph-wide row (`Whole graph`) has no node to point at, so it carries its own action instead
   (`Add node…`). While problems exist, the status reads `Preview paused`, since the preview is stale.
4. **Naming a new effect is a modal dialog, not a message.** Save as new, and Save or Save and
   apply on a built-in, open a Dialog over a scrim with a Name field; confirm writes, Cancel,
   Escape or a scrim click writes nothing. An empty name is explained inside the dialog (`#name`).
   *Revised 2026-11-09 (`Aurora-daaa.19`); was: Save opens the title menu with Name focused.*
5. **Keep disappears, and so does its disabled state.** While a test runs and the graph has
   changed, the bar says `Edited since the test`, and the title menu warns that Save and apply
   puts the edited graph live and ends the test (`#changed`).
6. **Stop never hides.** While a test runs the button is Stop (with the Once countdown); an outcome at rank 6 shows only after the test has ended.

How today's nine slots map:

| # | Today | Becomes |
|---|---|---|
| 1 | `editor-restore` (Restore, Discard) | Rank 2 banner |
| 2 | `editor-status` (`summarize`) | Ranks 3, 4, 7 in the status spot, and the problems chip when it reports problems |
| 3 | Reconnect button | Rank 4, inside the status spot |
| 4 | `editor-refusal` | Toast |
| 5 | `editor-error` (`Cannot reach Aurora`, `Cannot open`) | Rank 1 banner, with Retry |
| 6 | `editor-dirty` (`Unsaved changes`) | `Unsaved` beside the title |
| 7 | `editor-test-note` (`describeTest`) | Countdown beside Revert while running. Rank 5 and 6 in the status spot otherwise. `Kept` no longer exists. `Reverted` is a toast |
| 8 | `editor-notice` (`write` results) | Success: toast. Failure, `Fix the n problems before saving`, `Reload: ...`: rank 6. `Name the new effect first`: inside the naming dialog |
| 9 | `editor-graph-problems` list over the canvas | The problems chip, with `Whole graph` rows in its popover |

Not covered by the nine: the per-node problem marks on node bodies stay where they are.

**Removing panels removes some behavior.**

- Palette drag-to-place goes away in form A. A menu opened from `+` has no pointer
  position, so the node lands at the view center, possibly on top of another. No browser
  check covers palette drag, so a regression there would pass silently.
- Selecting a node no longer shows its details. Details becomes a deliberate action,
  and right-click is less discoverable than a panel that is always there.
- The Dashboard controls are no longer visible while wiring.

**Popups are new shared infrastructure.** The title, save, view, add and context menus
all need the same positioning, Escape, outside click, focus return and keyboard handling.
Existing lessons still apply: disabling a focused control drops focus, and controls with
side effects must not commit on arrow keys.

*Spike result (`Aurora-t2hz`, 2026-11-08): go on React Aria for these popups.* A throwaway
build of `react-aria-components` 1.22.1 on the canvas was driven in headless Chromium on the
fake-Hue stack. GrilleDS itself was not installed, so gaps in its wrapper are untested.
It works with these workarounds, which stage 2 should build in:

- **Pointer anchor.** Canvas, node and wire right-click all open at the pointer, using a
  0x0 fixed element as the Popover's `triggerRef`. The Popover must be keyed on the pointer
  coordinates, or a second right-click leaves the menu where it was.
- **Non-modal menus.** The default modal popover needs two clicks to select a node, blocks
  wheel zoom and ignores right-click elsewhere. With `isNonModal` all three behave. Then
  the editor owns two cases: a pane drag does not dismiss the menu, and Esc only works while
  focus is inside it.
- **Delete and Backspace.** React Flow listens at the document, so both still delete the
  selected node while a menu is open. Stop propagation for those two keys only in the menu.
  Stopping every key also swallows Esc.
- **Focus return.** Focus ends on `body` after close, since the pointer anchor is not
  focusable. Remember the active element on open and refocus it on close.
- **Focus ring.** The unlayered `:focus-visible` ring is 4px outward and the popover clips it
  by 3px a side at zero padding. Give popup containers 4px of padding or use the inset ring
  that `.dropdown-option` already uses.
- **Add node browser.** Autocomplete, SearchField and a sectioned list build form A, and
  empty sections drop out while filtering. Results keep list order, so ranking name matches
  first needs our own sort. The `A` shortcut must call `preventDefault`, or the keypress is
  typed into the search field it opens.
- **Space.** Space activates the focused menu item, so Space-pan is unavailable while a menu
  has focus. This is standard menu behavior and acceptable.

**Who owns which workaround.** Grille gets the general pieces: the point anchor, the
`isNonModal` and `onKeyDown` pass-throughs, and focus restore on close. The editor owns
everything specific to React Flow: blocking Delete and Backspace in menus, closing on pane
drag, Esc while focus is outside the menu, `preventDefault` on `A`, and the name-first sort.
Grille stays free of React Flow, and its modal `Select` keeps its current default.

Grille needs for the title, Save and context menus and the add browser:

- A Popover that takes a `triggerRef` or a point, with keyed repositioning and `isNonModal`
- Menu and MenuItem with `onAction` and `onKeyDown` pass-through, and a focus-restore
  callback on close
- A Dialog inside a Popover, for the title menu (below)
- Autocomplete with SearchField and ListBox, plus Section and Header exports
- A popup skin that matches Aurora. Grille's `.ui-popover` uses `#333` with `#515151`
  hover and no shadow, where Aurora's menus use `--aurora-surface` with
  `--aurora-surface-hover` and `--aurora-shadow-popup`, which Grille has no tokens for.
- A ring that fits. `.ui-listbox` has `padding: 4px 0` with `overflow: auto`, so the outer
  ring should clip on the left and right. Read from the CSS, not tested.

If Grille cannot supply these, fall back to `dropdown.css`. Full evidence is in the
`Aurora-t2hz` notes.

**The spike did not cover:**

- **The title menu.** It holds the Name box and the effect list, so it is a Dialog in a
  Popover with a TextField and a ListBox, not a Menu. Save opening it with Name focused
  is untested.
- **Keyboard-opened context menus.** Shift+F10 and `⋯` anchor to the node, not the
  pointer, and focus returns differently.
- **Grille's wrappers.** The spike imported React Aria directly, so the first Grille-based
  build is also the first test of the wrappers.
- **Toasts.** These stay local to the editor for now.

*Spike result (`Aurora-m5kl`, 2026-11-08): a built tarball installs under `ignore-scripts`.*
Grille commits no `dist` and builds it in `prepare`, so the git install left no `dist`. An
`npm pack` tarball with `dist` installed with the real `.npmrc`, recorded an integrity hash,
and passed `npm ci` with SSH disabled on Windows. Only a `file:` spec was run, so the https
release URL and the Mac and Linux builds are unverified.

- **Distribution (Grille G1).** Add a tag-triggered release workflow that runs `npm pack`
  and uploads the tarball as a release asset. Aurora depends on the release URL. Never
  re-upload an asset, since a changed hash fails `npm ci`. The repo is public and
  `web.yml` and the CMake step run a plain `npm ci`, so no CI change is expected.
  Committing `dist` or a sync script is not needed.
- **Version cleanup.** Grille has a local-only `v0.2.0` tag on an older commit, while
  `package.json` says 0.1.0. Delete it before the first release so tags and the release
  URL agree.
- **Bundle cost.** Measured at the end of stage 2 (raw / gzip): JS 441.18 / 139.49 kB to
  600.98 / 188.66 kB (about +49 kB gzip), CSS 34.41 / 6.11 kB to 44.78 / 7.87 kB. That is
  inside the accepted +60 kB gzip. The pre-build estimate was +186 kB JS and +6.6 kB CSS
  over a 25.8 kB CSS baseline. Stage 3 needs Autocomplete and ListBox, which pull in the same shared code, so this
  is the realistic end state. Measured at the end of stage 3: JS 646.84 / 202.19 kB (about +63 kB gzip over the stage 1 baseline, 3.2 kB under the 650 kB chunk limit). No compression was found in the embed step, so the raw
  bytes land in the binary.
- **Notices.** React Aria, React Stately, `clsx` and Grille appear in
  the generated third-party notices file automatically. Importing `fonts.css` would bundle 6 Inter files
  (about 165 kB) with no OFL entry, so it needs a hand-added notice. It stays out of scope.
- **Grille work.** Add a Menu, and trim `fonts.css` to woff2 only. Full numbers are in the
  `Aurora-m5kl` notes.

**Not in scope.**

- Ghost placement and wire-drop search, though see the note below
- Recent or favorite nodes, and a sources-first empty graph
- Copy, paste and duplicate
- Per-node live previews (`Aurora-h6yz`)
- Editor support in the web demo (`Aurora-51nv`)
- Bundling the Inter font. No `@font-face` exists in `web/ui`, so Dashboard and editor
  both depend on what the system has installed. Grille's `fonts.css` would fix this, but
  it needs a hand-added OFL notice and should land app-wide, so the two don't differ.

Two stretch items affect today's design. Wire-drop search needs a row to mean a node and a
port, as Unity's does, so the row component should not assume one row per node forever.
Ghost placement answers the lost drag-to-place above, so it may be worth pulling in if
landing at the view center feels bad in use.

**The mock folder may ship.** The web root embed globs all of `web/ui`, and no exclusion
for `Static_` folders was found, so this folder and `Static_kep2_Mocks` likely end up in
app builds. Exclude them or remove this one before release.

## Sequencing

**The main constraint is the open Sequence E gate.** `Aurora-pvxx.9` is in progress. It has
passed on Mac, Windows and Linux are outstanding, and it blocks `Aurora-pvxx.18`, the epic's close and `Aurora-h6yz`.
Its Playwright checks drive the editor by current class names and labels, including
`.palette-item`, `.editor-name input`, `.editor-header select` and the `.inspector-*`
classes, across five check files. Structural changes break those checks.

| Option | Upside | Downside |
|---|---|---|
| Finish the gate first, then clean up | Sequence E closes on evidence, and checks migrate once with a known good baseline | Cleanup waits on three-OS passes |
| Clean up first, gate once on the final UI | One gate run, on the UI that ships | Sequence E stays open longer, and a failure could be either the cleanup or the original work |
| Run both, migrating checks as each stage lands | No waiting | Most churn, and the gate result stays muddy |

Decision: clean up first (see Decisions). Stage 1 and the Grille prerequisites do not touch
the editor's checks or lockfile.

**Grille prerequisites** (in `weblings/GrilleDS`):

- **G1 Distribution:** the release workflow and the tag cleanup from the `Aurora-m5kl` result.
- **G2 Popup skin:** tokens for Aurora's menu surface, hover and shadow, and the ring fit.
  This may change how RockyRoadImport's `Select` looks (see Decisions).
- **G3a Menus:** Popover with the point anchor, Menu, Dialog and `Button` size and icon.
  The context menu needs nothing beyond this. Needed by stage 2.
- **G3b Add browser:** Autocomplete, SearchField and a sectioned ListBox. Needed by stage 3.

**Proposed order.** Each stage leaves the editor shippable.

1. **Back link and styling.** Fixes the most visible problems and changes no structure.
   The back link reads Dashboard, since the editor is part of Aurora and the Dashboard is
   where it lands. It uses the NUX back arrow (`web/ui/icons/back-arrow.svg`) and links
   to `/`, so it works however the editor was opened. The mock still shows `← Aurora`.
   CSS only: Grille's `Button` and `TextField` take no `className`, so swapping them in
   here would remove the class names the checks use.
2. **Grille in the build, then popup foundation and top bar.** First, add the release
   dependency and confirm `web.yml` and all three OS builds pass with the release URL,
   with no visible change. This needs G1 and the gate. Then the title and Save menus become
   the first real users of the shared popup behavior on G3a. The status priority rule is
   settled here, and most header and action row selectors change.
3. **Add node menu** (`Aurora-daaa.24`). Replaces the palette. Directions 1-3 are decided (cascade,
   catalog `group`, two texts). Needs G3b (`Aurora-daaa.20`) and Grille submenus (`Aurora-daaa.23`).
4. **Right-click, drawers and Delete.** Must land together. The Inspector can only go once
   the node menu and drawers can reach everything it did.

Control count: stage 2 brought Screen colors to 78 (video) / 126 (audio); stage 3 (palette
removed, `+` button added) brought it to 26 / 74. The mock's 11 is the stage 4 target, since
it needs the inspector controls gone.

Stages 3 and 4 are independent of each other, but both depend on stage 2. Check migration
belongs in each stage rather than a cleanup at the end, and those checks should also add
coverage for right-click and the new menus.

**Against other work.** `Aurora-h6yz` should follow direction 4, so previews are designed
into the new node. A copy pass from direction 3 can run at any time, and it does not block
the menu.

## Decisions (owner, 2026-11-08, `Aurora-daaa.5`)

- **Gate order:** clean up first. Mac stays the working check during the cleanup, and the
  Sequence E gate (`Aurora-pvxx.9`) runs once on Windows and Linux against the final UI.
  A failure then could come from the cleanup or the original work, which is accepted.
- **G2 skin:** Grille takes Aurora's popup surface and shadow, and RockyRoadImport's `Select`
  picks it up. A no-shadow variant for WebXR is untested and deferred; a popup shadow token
  that can be set to `none` keeps the door open.
- **Light popups rejected:** a white Dashboard effect dropdown with a light panel was tried
  with tokens only. A large light popup is jarring when everything else is dark, so the
  Dashboard stays dark.
- **Bundle budget:** about +60 kB gzip (+42% JS) is accepted. Superseded 2026-11-09: no bundle
  budget (see the Decisions entry of that date).
- **Title menu:** a Dialog in a Popover. It also holds the file actions: Save (Ctrl+S),
  Save as new, Rename, Open another effect and New empty effect. The Save
  split button is dropped. *Revised 2026-11-09 (`Aurora-daaa.19`):* the Name box leaves the
  menu. Rename… (custom effects) and any write that creates a new effect open a modal naming
  dialog over a scrim instead. The modal is Grille's `Modal`, added in `v0.1.0-dev.4`
  (`Aurora-daaa.22`). Menu
  items inside a Dialog need their own arrow-key and focus handling, and "Save opens the
  menu with Name focused" is untested, so `Aurora-daaa.8` covers both.
- **Save and apply:** a title menu item beside Save and Save as new, with no toast. The
  title menu's file actions are Save, Save as new, Save and apply, Rename, Open another
  effect and New empty effect.
- **Keep goes away.** After Test on lights the bar shows only Revert, and a user who likes
  the test uses the title menu's Save or Save and apply. Keep today commits the tested graph
  and is disabled once the graph changes; Save and apply commits the current graph and has
  no such limit. Checked 2026-11-08 on the fake-Hue stack (dummy input): Save and Save and
  apply during a running test do not end it. The test stays active (`GET /api/graph/test`
  still `active: true`), while apply makes the new effect the active one. So the title menu's
  Save and apply should end the test itself, by calling `/api/graph/test/revert` after the
  write (the revert reads the live effect fresh from disk, so it lands on the effect just
  applied) or by using `/api/graph/test/confirm` when the graph is unchanged since the test.
  Not checked: what the lights show between the apply and the test ending, for an edited graph.
- **Save on the running effect already goes live.** The server reloads the pipeline when Save
  writes the active custom effect, so Save and apply only differs for an effect that is not
  the running one.
- **Direction 5:** desktop only for this pass.
- **Direction 6:** keep the effect switcher in the title menu, and no warning when leaving
  with unsaved edits. Revisit if needed.
- **Grille tracking:** Grille work is tracked by beads in `weblings/GrilleDS` (prefix
  `Grille`): G1 is `Grille-251` (Aurora `daaa.7`), G2 and G3a are `Grille-48x` (Aurora
  `daaa.8`), G3b is `Grille-h7g` (Aurora `daaa.20`, installed as the `v0.1.0-dev.4`
  prerelease cut from Grille's dev branch), and Menu submenus for the cascade are
  `Grille-ofj` (Aurora `daaa.23`, the next dev prerelease). The Aurora beads stay as the consumer-side blockers
  and close when the matching Grille release installs here.


## Decisions (owner, 2026-11-09)

- **Direction 1, Add node menu form:** B, the cascade. Search sits at the top and switches
  the menu to a flat ranked list while there is a query. Without a query, one row per group
  opens a flyout of that group's nodes. Each node row shows its `purpose`; `useWhen` goes in
  a hover tooltip. B gives up only A's port preview beside the list. Flyouts need Grille
  submenus (`Grille-ofj`, Aurora `daaa.23`).
- **Direction 2, node groups:** a catalog field, `NodeTypeMeta::group`, carried through
  `/api/nodes`, `/api/v1/nodes`, the descriptors and the server samples. It is additive, so
  `/api/v1` stays compatible.
- **Group names:** the mock's seven, in signal-flow order: Sources (7), Audio (4), Image (7),
  Color (8), Numbers (10), Motion (5), Lights (12). They cover all 53 registered types, one
  group each. Flat, with no nesting. Lights is the name to watch if people look for "Frame".
- **MCP:** `list_nodes` returns `group` on each entry and takes an optional `group` filter.
  Its existing `category` argument stays a type-prefix filter (e.g. `frame.`), and its
  description says so, since reusing `category` for groups would return an empty list for
  agents that pass a prefix.
- **Direction 3, copy:** two texts. `purpose` and `useWhen` stay as the agent text and keep
  their mechanics (zone matching, ranges, re-seeding). New user-facing fields
  `NodeTypeMeta::summary` (the menu row) and `NodeTypeMeta::tip` (the hover tooltip) are
  written for all 53 nodes in stage 3. Rules: summary at most 10 words; tip one sentence of at
  most 12 words, saying when to reach for the node; name another node (by display title, never
  type id) only when this one does nothing without it; param advice belongs in the param's
  help, not the tip. Until a node has them, the menu falls back to `purpose` and `useWhen`.
  Examples: Mix frames: "Blends two sets of light colors into one." / "Combine a screen
  effect with a music effect." Bar image: "A band of color that sweeps across the room." /
  "Chases and sweeps. Drive Position with an LFO to move it."
- **No bundle budget.** Grille is the shared design system, so its code is expected in the
  bundle. The editor is served from the local app, so size does not affect a network load.
  Size is reported in each stage's log, not held to a number. Vite's chunk warning sits at
  1000 kB as a tripwire for an accidental large import, not as a target.
- **Shortcut:** Shift+A opens the Add node menu while the canvas has focus, as in Blender.
  Tab stays browser focus movement, and Space stays pan. Double-click on empty canvas
  (ComfyUI's route) is a possible later mouse route; it needs React Flow's
  `zoomOnDoubleClick` off.

## Decisions (owner, stage 4)

- **Direction 4:** params stay on the node. The Details drawer holds the purpose, ports and
  the Show on the Dashboard checkboxes, not the params. A collapse waits until a real graph
  needs it.
- **Details follows the selection.** Once open, the Details drawer shows whichever node is
  selected, as Blender's sidebar does. Selecting a node does not open it.
- **Drawer comes from Grille.** Non-modal, one open at a time, closed by Esc or its close
  button but not by a canvas click, and it sits over the canvas rather than pushing it. It
  is a Grille prerequisite for stage 4 (`Grille-vxt`, Aurora `daaa.28`), like G3a and G3b were for stages 2 and 3.
- **`⋯` on every node, never hidden from assistive tech.** It is a real button, "Actions
  for <node title>" with `aria-haspopup="menu"`, faded until hover or selection but always
  rendered. Each node also gets an `aria-label` with its title, since React Flow gives nodes
  none. This follows the frame 8 result (`kep27-voiceover-tree-check`): the row menu failed
  on VoiceOver only because its `⋯` was `aria-hidden`. Shift+F10 opens the same menu.
- **Dashboard controls while the drawer is closed.** A param that is on the Dashboard shows
  a mark on the node. Under each ticked checkbox, Details shows that control's Label,
  Section and Tooltip, so tick and label happen in one place. The Dashboard controls drawer
  is for order, removal and review. The node menu's Show on the Dashboard opens Details at
  the checkboxes.
- **Deleting a node that has controls says so.** The toast reads, for example, `Removed 1
  Dashboard control with Hue shift`. Undo brings it back, so there is no confirm and no
  Undo button in a toast that lasts 3 s. Prior art (Unity's unused properties, Houdini's bad
  reference warnings, TouchDesigner's broken binds) never drops an exposed param silently.
- **Delete:** the Delete key joins Backspace. Menu Delete acts on the whole selection and
  says how many (`Delete 3 nodes`). Right-click Add node places the node at the pointer.
- **Controls model unchanged in stage 4.** A control stays a pointer to one node param. A
  graph-level model (Unity Blackboard, or Houdini-style promotion where the control owns the
  value) is undecided and tracked outside this epic.

## Decisions (owner, narrow windows, 2026-11-10)

`Aurora-daaa.29` found that at 400 px the top bar runs 92 px off the window and at 700 px
a 350 px drawer covers half the canvas and the node it describes. Two different cases:

- **~700 px is a desktop window.** Tuning an effect beside the video it reacts to (half of
  a 1440-1512 px laptop screen is 720-756 px) is a likely way to work. In scope.
- **~400 px is a phone.** The server listens on all interfaces and the Dashboard links to
  the editor, so a phone can land here. Touch editing stays out of scope: wiring and
  selection on a canvas are the hard part on touch (Node-RED's users report it), and the
  phone node editors that work are native touch apps or drop the canvas for a list
  (ComfyUI's community mobile frontend). The page must not break, nothing more.

Decided:

- **Top bar shrinks by priority, never wraps.** Test on lights, the title and the back
  link always stay. Below about 650 px, Undo and Redo become icon buttons and `Unsaved`
  becomes a mark on the title. Below about 520 px, the back link shows only its arrow and
  Undo and Redo move into a More (`⋯`) menu on `EditorPopup`. At the floor, Test on lights
  reads `Test`, keeping the full name as its tooltip and accessible name. Below 600 px a
  dismissible line says the editor is built for a desktop window. A finer pass on what each
  menu holds is expected later.
- **The side drawer narrows, the canvas keeps the node in view.** Width is
  `clamp(280px, 40vw, 350px)`, set by overriding Grille's `--ui-size-drawer-width`
  token in the editor (no Grille change). When Details opens, follows a new selection or
  the drawer changes size, the canvas pans so the selected node sits clear of the drawer.
  The demo refits its camera the same way on pane resize (`web/demo/main.js`).
- **Narrow or portrait windows get a bottom drawer.** Below about 650 px wide, or clearly
  portrait (aspect under about 0.75), the drawer docks at the bottom at half height, with a
  visible half/full toggle button. A short laptop window stays on the right side: there
  height is the scarce dimension. Prior art: SwiftUI's inspector is a trailing column at
  regular width and a sheet with detents at compact width; Material-aligned libraries
  switch at 600dp. This needs `side: 'bottom'` and the half/full state in Grille's Drawer.
- **No container queries in the drawer bodies (`Aurora-daaa.29.5`).** The Details and
  Dashboard controls bodies are a single column of full-width rows, and the screenshots at
  400x800 (half and full height) and 1100 px show them fitting with no overflow, so one
  layout serves both the side drawer and the bottom sheet. Add container queries when a
  drawer body gets a multi-column layout.
- **No drag to resize, no maximize, no user layout yet.** A drag edge is found only by
  hovering it, and needs its own keyboard support (WAI-ARIA window splitter). Fewer than
  5% of users change defaults (Spool's Word study; Mackay 1991), so defaults carry the
  design. Figma's UI3 tried floating panels and settled on fixed, resizable ones; Blender,
  Unity, VS Code, Houdini and TouchDesigner offer full docking because they have dozens of
  editor types used all day, which this editor does not. Drag to resize, a user dock
  choice and saved layouts wait until someone asks.
- **Thresholds are values, not a shared library.** The demo switches its split at 1:1
  aspect in plain CSS (`web/demo/demo-layout.css`); `web/ui` breaks at 649 and 480 px.
  The editor is the only Grille consumer, so a shared package would add a sync path for
  three numbers. Prefer `web/ui`'s values where they fit. If a third place needs them,
  they become Grille breakpoint tokens (JS constants, since media queries cannot read
  CSS variables). The demo's layout fixes still apply: `min-width: 0; min-height: 0` on
  flex panes, and `box-sizing` on a pane outside a scoped reset.

## Decisions (owner, Grille mock switches, 2026-11-10, `Aurora-s1t7.6`)

Stage 5 (`Aurora-s1t7`) brings the editor to the Grille mock
(`web/ui/Static_GraphEditor_Mocks_Grille/`). Its frame strip has four Decisions switches
(the mock README describes each). Chosen:

1. **Back link and title boxed: on.** Both are Grille secondary buttons, so no borderless
   Grille variant is needed. With choice 2 this is Grille's default `ui-button`, which
   `Aurora-s1t7.1` already applies; the separate styling bead (`Aurora-s1t7.7`) was folded
   into it.
2. **Test on lights primary: off.** Grille secondary, so no bar-size override for primary.
3. **Test split button + Zones island: on.** Filed as the epic `Aurora-qjqy`:
   - Light tests get a mode (`Aurora-qjqy.1`). Once reverts after 15 s; Live runs until
     stopped, and losing the heartbeat still reverts it. Today every test has the same
     120 s cap.
   - MCP `try_on_lights` defaults to Once and takes an optional mode (`Aurora-qjqy.2`).
     An agent rarely gets the user's answer inside 15 s, so `keep` also accepts the tested
     draft after a test timed out, as long as the draft has not changed.
   - The editor's status pill, Test on lights, countdown and Revert become one split button
     `[▷ Test ⌄]` (`Aurora-qjqy.3`), and the status priority rule above is rewritten there.
     For that reason the bar regroup (`Aurora-s1t7.2`) only moves the problems chip.
   - The Zones island needs no engine change, so it stays in stage 5 (`Aurora-s1t7.4`).
4. **Zones island without the resize button: on.** One small size only. The resize code
   stays in the mock in case a larger map earns its place later.

Not a mock switch, raised at the same review: the mock shows Cannot reach Aurora as a
banner under the bar. The editor's three under-bar banners (unreachable, Restore or
Discard, the window-size note) move to the Dashboard's error shell in a follow-up stage 6
(`Aurora-u68h`, `Aurora-s1t7.9`), kept out of stage 5. *Revised 2026-11-12:* only the
unreachable banner goes to the shell; see Decisions (owner, stage 6 scope, 2026-11-12).

## Stages 5 and 6 (filed 2026-11-11)

The Grille mock (`web/ui/Static_GraphEditor_Mocks_Grille/`) has moved past the shipped editor, so two stages follow stage 4. Each leaves the editor shippable and changes its browser checks in the same stage.

Owner decisions at the mock review (2026-11-11), beyond the four switches above:

- Dashboard controls sit bottom-right. Zoom stays bottom-left with the minimap stacked directly above it, and the View menu opens above the minimap, so the map never covers the Minimap item that turns it off.
- The "On the Dashboard" diamond is cut (no icon).
- One icon set: Vidstack where it has the shape, Zest Free for undo, redo and minus, Aurora's warning mark. Grille owns it (`Grille-ky2`) and the editor adopts it (`Aurora-s1t7.5`). The audit is in the graph editor README (Icon audit).

| Epic | Covers | Order |
|---|---|---|
| `Grille-ky2` (GrilleDS) | Icon source and notices, a React `Icon`, a plain-SVG export, Drawer and Select glyphs, a dev prerelease | Starts now. `Aurora-s1t7.5` waits on its release |
| `Aurora-s1t7` stage 5 | Grille buttons and the 32 px bar (`.1`), problems chip before Undo (`.2`), canvas corners and minimap (`.3`), Zones island with the side-drawer fix (`.4`, `Aurora-daaa.35`), icons (`.5`), close-out (`.8`) | `.1` to `.4` can start now |
| `Aurora-qjqy` | Light test modes in core and MCP, then the Test split button | Core and MCP do not touch the editor. The editor bead (`.3`) changes the bar |
| `Aurora-u68h` stage 6 | Each editor message in its own place; the banner under the bar is retired (rescoped 2026-11-12, see below) | After stage 5. Its mock frame (`.1`) and `Aurora-iryq` start first |
| `Aurora-u8jx` stage 7 | Problems in people's words: copy per issue code, Whole graph row actions, runtime error wording | After the stage 6 mock review; runs alongside stage 6 |

Grille `v0.1.0` (`Aurora-daaa.16` here, `Grille-0up` in GrilleDS) is the end of the whole process, not part of stages 5 to 7: there is more UX refinement to do before either side locks.

## Decisions (owner, stage 6 scope, 2026-11-12)

Status: decided, not built. Replaces the stage 6 notes of 2026-11-11 and 2026-11-12, which asked whether the problems UI and the toast belong in the error shell.

The editor's banner under the bar held five kinds of message: Aurora unreachable, a question (Restore or Discard), refused Save clicks, test outcomes the user did not cause, and advice (the window-size note). It was a catch-all, not a pattern, so stage 6 retires it and gives each kind its own home.

- **The error shell carries only connection and host-state errors** (Cannot reach Aurora, Draft not sent, Lost contact, Reload: …). That matches [[error-overlay]]'s by-cause rule: the shell shows what Aurora is not doing, and refused clicks stay at their control.
- **The problems chip stays separate from the shell.** The shell is app-level; problems belong to one document and point into the canvas. Mixing them would make one `N problems` count mean both "Aurora is down" and "an input is unwired", and make ordinary editing look like an alarm.
- **The toast stays editor-local** and keeps its job (status priority rule). Messages the screen already shows become screen-reader announcements only, and toasts that report a loss get Undo (`Aurora-u68h.6`).
- **No error/warning severity tiers**, in the problems popover or the shell. Today every validation issue blocks; only runtime preview errors do not, and they are rare. Tone would mean "does this block you" (as in RockyRoadImport's status tones) if tiers are ever added, for example with checks that do not block such as "nothing reaches the lights".
- **The React shell is the one we keep.** Stage 6 builds it in the editor (`Aurora-s1t7.9`), with rows fed in from outside and `shell.css` markup. The Dashboard keeps `web/ui/shell.js` until it moves to React (`Aurora-4nqt`), then adopts the component and Grille styling. Mounting a React island in the vanilla Dashboard now was rejected: it adds a build step to `web/ui` and the demo mirror for one component.
- **A saved effect is always runnable.** A graph with problems is never written to the effect file. Save with problems keeps the work as the kept copy and says so; Save and apply stays off with its reason.
- **Two effect states: Saved, and Unsaved changes.** A kept copy restores silently when the effect opens, marked `Unsaved`, with Revert to saved in the title menu (as VS Code's hot exit does). The editor only asks when the saved effect changed since the copy was made. Revises Open direction 6 (Restore offered on return). Each new effect gets its own id when created. Open ▸ marks effects with unsaved changes.
- **Graph problems get user-facing copy** keyed by issue code; the server's messages stay as they are for agents and MCP. This follows Open direction 3 (two texts).
- **Room for editor tabs** (`Aurora-yrhp`, not committed): unique ids, one kept copy per effect, and one `openEffect(id, where)` route keep tabs possible later. The draft, preview and light test are per browser tab today, so tabs would need a rule for the inactive ones.

Outside the stages: kept copies stored in Aurora instead of the browser (`Aurora-n0jm`), and two browser tabs on one effect overwriting each other's copy (`Aurora-ofzv`).

## Known follow-ups (filed under `Aurora-daaa`)

Small items found during stage 2 that are not part of any stage's scope yet. None is assigned
to a stage; whoever next touches the area picks it up.

- `Aurora-daaa.14` (fixed): a test outcome in the status spot now clears on Save and on undo
  back to the saved graph.
- `Aurora-daaa.15` (fixed): drop dead status CSS and settle the Vite chunk-size warning.
- `Aurora-daaa.16`: move to Grille v0.1.0 at the end of the cleanup epic.
- `Aurora-daaa.17` (fixed): problems popover rows are cramped; the node id now stacks above the message.
- `Aurora-daaa.18` (fixed): `builtin.audio` opens at 37% with unreadable nodes and an empty thumbnail
  box while the preview is paused; fit view now stops at 60%, and the thumbnail hides until the first frame.
- `Aurora-daaa.19` (fixed): the Name field on a built-in reads as a hovered menu row. Reframed: naming
  moves to a modal dialog (direction 4), using Grille's `Modal` (`Aurora-daaa.22`, installed
  as `v0.1.0-dev.4`).
- `Aurora-daaa.21` (fixed): the status spot said `No draft yet` before the preview connected; it now reads `Connecting`.
