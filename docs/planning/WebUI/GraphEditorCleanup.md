# Graph editor cleanup

Id: graph-editor-cleanup

Status: stage 1 built (back link, Aurora component styles); stages 2-4 proposed.
Written 2026-11-06 under `Aurora-bova`. The owner has reviewed the working mock and
likes the direction, but none of the open directions below are chosen yet. Treat
stages 2-4 as a proposal until this line changes.
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
- Save as new and Save and apply move under a `▾` on Save.
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
| B: Cascade | Compact, reads like a context menu | Little room to explain a node, fiddly flyouts |
| C: Side sheet | Stays open for adding several, uses the accordion look | A panel again, which works against the goal |

Recommendation: A, optionally with a pin to keep it open.

### 2. Who owns the node groups

The catalog has no category field, so the mock's groups are a hand-written map.

- **Editor map:** small and fast, but it lives apart from the node definitions. A new
  node needs an `Other` fallback and a test that flags it.
- **Catalog field:** one source of truth that agents also get through `list_nodes`, but
  it touches every node registration, `/api/nodes`, `/api/v1`, MCP and the server samples.

Recommendation: start with the editor map, and promote it only if agents or other
consumers need the groups.

### 3. One text for people and agents, or two

The menu puts `purpose` and `useWhen` in front of users for the first time, and some
of it reads like developer notes ("today's subsampleWidth", `Absent`, `output.send`).
The MCP server sends that same `purpose` text to agents, where precise wording helps.
Some params also have no label.

Either rewrite shared text so it works for both audiences, or add user-facing text
beside it. Rewriting is smaller, but it changes what agents read and needs a check that
agent results hold up. This also settles vocabulary, such as `Lights` as the group name
while the port type stays `Frame`.

### 4. How far the node itself changes

The mock restyles nodes and keeps params on them, as Unity, Blender and ComfyUI do.
Nodes with many params get tall: Hue ramp image has seven. Options are to keep all
params on the node, collapse secondary ones, or move them to the drawer. The choice also
sets how much room is left for per-node previews (`Aurora-h6yz`).

Recommendation: keep params on nodes for now, add a collapse later if real graphs need it.

### 5. Is touch or narrow width a target

The effect panel was tested on an iPhone. The editor never has been, and the mock is
desktop-first. Declaring it desktop-only keeps the work smaller. Supporting touch adds
real work on wiring, pan and selection, well beyond menu access. The visible `⋯` keeps
the door open either way.

Recommendation: desktop-only for this pass, stated plainly in the editor README.

### 6. Effect switching and leaving

- **Effect switcher:** keep it in the title menu, or make the Dashboard the only place
  to pick an effect. Recommendation: keep it for now, since comparing effects while
  editing is useful. Removing it later is easy, and it must not switch on arrow keys.
- **Leaving with unsaved edits:** the browser backup already keeps them and offers
  Restore on return. A warning on `← Dashboard` adds safety and a little friction. The backup
  is per browser, so edits made in one browser are not offered in another.
  Recommendation: no warning, but say in the toast or title that edits are kept here.

## Scoping concerns

**The mock does not cover every real state.** These exist today and need a design before
the top bar is built:

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
- **Bundle cost.** The baseline is 439 kB JS (139 gzip) and 25.8 kB CSS (4.4 gzip). Adding
  `ui.css`, Grille's `Select` and React Aria `Menu` and `Popover` gives about +186 kB JS and
  +6.6 kB CSS, roughly +60 kB gzip, or +42% JS. Grille has no Menu yet, so `Select` stood
  in. Stage 3 needs Autocomplete and ListBox, which pull in the same shared code, so this
  is the realistic end state. No compression was found in the embed step, so the raw
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

Recommendation: finish the gate first if Windows and Linux passes are cheap. Stage 1 and
the Grille prerequisites can proceed either way, since neither touches the editor's checks
or lockfile.

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
3. **Add node menu.** Replaces the palette, so directions 1 and 2 must be decided first.
   Needs G3b.
4. **Right-click, drawers and Delete.** Must land together. The Inspector can only go once
   the node menu and drawers can reach everything it did.

Stages 3 and 4 are independent of each other, but both depend on stage 2. Check migration
belongs in each stage rather than a cleanup at the end, and those checks should also add
coverage for right-click and the new menus.

**Against other work.** `Aurora-h6yz` should follow direction 4, so previews are designed
into the new node. A copy pass from direction 3 can run at any time, and it does not block
the menu.

## Decisions needed before filing build beads

- Directions 1 and 2 block stage 3.
- Direction 3 decides whether the copy pass touches core.
- Direction 5 sets how much the popup foundation must handle.
- The popup library question is answered by the `Aurora-t2hz` spike (see Scoping concerns).
  The `Aurora-m5kl` spike settles distribution. Three choices remain:
  - **G2 skin:** whether RockyRoadImport's `Select` takes the darker menu surface, or
    Grille gets a second popover look
  - **Bundle budget:** accept about +60 kB gzip for the editor
  - **Title menu:** confirm it as a Dialog in a Popover
- Where the Grille work is tracked, since GrilleDS has no beads.
- The gate order decides when stage 2 can start.
