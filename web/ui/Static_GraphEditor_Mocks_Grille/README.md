# Graph editor mock on Grille

Copy of `../Static_GraphEditor_Mocks` (`Aurora-bova`) built on Grille `0.1.0-dev.17` (grille/ refreshed from node_modules, Aurora-e4bi.7) for `Aurora-daaa.31`,
so the layout can be judged with real Grille styling before the editor changes. The original mock is untouched.
Open `index.html` directly. Frames work as in the original (`#rest`, `#problems`, `#testing`, `#changed`, `#reconnect`, ...).

`grille/` holds `tokens.css`, `ui.css`, `fonts.css` and the Inter files copied from
`web/graph-editor/node_modules/@weblings_things/grille/dist`. Copy them again after a Grille bump. `gen.py` is as before.

## What differs from the original mock

- Styling: Grille tokens and `ui.css` (`--ui-*`, `.ui-button`, `.ui-text-input`) replace `../styles`. Nothing imports `../styles` or `../icons`; chevrons and the warning mark are inline SVG.
- Back link reads `← Dashboard` (was `← Aurora`).
- Buttons are Grille sizes: `data-size="sm"` in the bar, default size on the canvas. Undo and Redo are `data-icon` buttons. The mock's larger bar buttons are gone.
- The problems chip is a plain Grille button with a warning mark, not a dashed-border chip. The focus ring is Grille's.
- Local styles on Grille tokens: dividers, the status dot, the muted count, the borderless variant, the bar-size primary, field/slider/toggle rows.
- A static page has no react-aria, so Grille's `[data-hovered]`, `[data-pressed]` and `[data-focus-visible]` never set. `mock.css` adds `:hover`, `:active` and `:focus-visible` fallbacks. The real editor needs none.
- Placement carried over from the mock: `+ Add node` labelled on the canvas top-left, problems chip and preview status in the right group before Undo, dividers after the back link and before Test on lights, Dashboard controls bottom-right with a muted count, zoom menu bottom-left, collapsible Zone preview top-right, problems popover dropping from the chip.
- Zoom menu bottom-left. Minimap (`Aurora-daaa.36`, owner 2026-11-11): the View menu's Minimap item toggles a small map stacked directly above the zoom button, and the View menu then opens above the map, so the map never covers the item that turns it off. It lifts with the bottom dock and hides at full height like the corner buttons. Frame **Minimap on** shows it with the menu open. React Flow's credit sits bottom-centre in small muted text (`attributionPosition="bottom-center"`). The credit is kept: React Flow's docs ask that only Pro subscribers hide it (`proOptions.hideAttribution`), with no stated exception for personal or open-source use.
- Menus, drawers and the add node menus keep the original mock's own markup, recoloured with Grille tokens. They are not Grille components.

- Gradient stops (frame **Gradient stops**): one row per stop with a Zest `minus` icon button to remove it (off at the 2-stop minimum) and `+ Add stop` with the Vidstack `add`. The editor's `ParamWidget` draws the remove button as a `−` character today.

## Decisions the frame strip toggles cover

The dashed strip's **Decisions** group has four switches. They apply to every frame.

1. **Back link and title boxed**. On: both are Grille secondary buttons. Off: a borderless variant (local `.ge-ghost`, fill only on hover). RockyRoad has no borderless button, its lightest is the outline `lib-btn-secondary`. Grille has none yet either, so off means a new variant.
2. **Test on lights primary**. Off (default, as in the mock): Grille secondary, dark. On: Grille primary, light. Primary keeps the bar's small size through a local override, because Grille's primary is the large form-button size.
3. **Test split button + Zones island** (`Aurora-daaa.32`, default off). On: the status pill, Test on lights, countdown text and Revert collapse into one split button `[▷ Test ⌄]`. The menu picks Once (15 s) or Live (until stopped) and starts that test. The label is the state: `▷ Test` at rest, `■ Stop 0:12` during Once (a real countdown only when started by click; the Testing frame holds 0:12), `■ Stop` during Live, which is the revert. Take over and Reconnect are the button's own labels. Problems and Cannot reach Aurora disable it with a tooltip. No status text. The Zone preview becomes a **Zones** island of plain cells: one 14 px cell per zone, 8 per row, for the single active output (one output is taken as canonical; the preview frame can carry several, and a second block would just follow below), with no screen mapping (the first cut mapped the active output's zones to their regions as `ZoneThumbnail.tsx` does, in commit d643ce57; dropped because zone regions can overlap, and fresh zones all start full-screen, so a mapped box hides zones). Header has the hide chevron. A fullscreen icon in the bottom-left corner toggles small and large (348 px, drawer width), shown on hover and focus and always under `@media (hover: none)`. Off keeps the original layout unchanged. The **Testing live** frame matches Testing with the switch off. Both are local mock components on Grille tokens, not proposed for Grille.
4. **Zones island: no resize** (default off, only visible with switch 3 on). The same collapsible `Zones ⌄` island, without the small/large resize button. The resize experiment stays in the code behind this switch being off, in case a larger map earns its place later (for example with zone names on hover or click-to-select).

## Narrow windows (`Aurora-daaa.34`)

The drawers follow the editor (`daaa.29.2`, `daaa.29.4`), so those layouts can be judged here. The **Narrow (new window)** links in the frame strip open the Dashboard controls frame in a popup of the stated size (or resize the window by hand).

- Side drawer width is `clamp(280px, 40vw, 350px)`, shared as `--drawer-w` (the large Zones map uses it too).
- Below 650 px wide (width only, `Aurora-daaa.37`), the drawer docks at the bottom at half the canvas height. An expand / collapse icon button (the Zones resize icons; tooltip Full height / Half height) sits in its header, and the close button is the Vidstack x mark. The editor's node-clear pan is not mocked.
- Zone preview: with a side drawer open it steps left of the drawer; with the dock open it stays top-right above it. In both it stays visible, large map included (check at 400x800).
- Bottom corner buttons: with a side drawer open, Dashboard controls steps left of it (so it can still close the drawer) and zoom stays bottom-left. With the dock at half height both lift above the sheet. At full height they are deliberately hidden, as is the React Flow credit; the toggle or close brings them back. In the editor the cells would be DOM elements, not the thumbnail's canvas (zone counts are small until LED strips are supported).

## Node-shape changes (`Aurora-1cmx`)

Tried here before the editor builds them (`Aurora-d0hv`, `Aurora-jsjj`, `Aurora-0veq`).

- **Circle sockets**: every socket is a circle in its domain colour (video teal, audio violet, light amber, numbers gray). The `diamond`/`triangle` classes are gone. The wire now carries the difference: Image, AudioBuffer and Frame wires are thicker (3.5 px), Trigger wires are dashed.
- **Converters**: `angle.fromFloat` and `angle.toFloat` (param `scale`, default 360) are mock-only entries pushed onto the catalog in `mock.js`; `catalog.js` is not edited. They sit in the **Numbers** group next to `angle.add`: they are pure number-to-number maths like the rest of that group, while Motion holds nodes that keep state over time. Drop the mock-only entries when `gen.py` is next run after `Aurora-jsjj` lands.
- **Refused wire**: the existing Image to Frame frame is unchanged; a new **Refused: Float to Angle** frame names the converter in its toast.
- **Auto-insert** (**Auto-insert converter** frame): a Float wire dropped on an Angle input leaves `angle.fromFloat` as a visible node (outlined as new), wired on both sides and placed between the two nodes, clear of both. Undo would treat the drop as one step: the node and both wires go together and the original Float wire is not needed back, since it was never made.

## Stage 6 board (`Aurora-u68h.1`)

Frames **Stage 6** in the strip (`#s6` all three, `#s6-shell`, `#s6-test`, `#s6-prompt`): a static board, not the editor, showing where each editor message lives once the banner under the bar is retired. The title menu and Open path are the live frames below, not board sections. Owner review is complete and recorded on the bead; nothing is open.

- **Error shell** (`#s6-shell`, 6a): the Dashboard's shell reused exactly (`web/ui/index.html` `#shell-banner-slot`, `shell.css` rows, `shell.js` wording), above the bar, full width, rows in a 640 px column. Drawn: the reload row ("Couldn't apply settings: ..."), the two editor-supplied draft rows split by the draft PUT's error code (too_many_drafts: "Couldn't check your last edit: too many editors are open. Close one to continue."; invalid_session or invalid_body: "Couldn't check your last edit."; no buttons, no x), two rows collapsed to "2 problems" and expanded with "Show less" (reload + too many editors), and the "Aurora has stopped" takeover (also the network-failure case). draft_too_large is not a shell row: a panel shows it as a Whole graph problem on the problems chip ("Couldn't check your last edit: the graph is too large (over 256 KB)."). Host-state rows show and dismiss on both pages; draft rows are editor-only and clear when a later send succeeds.
- **Test button** (`#s6-test`, 6c): no mark, outline or label change for outcomes the user did not cause. (a) Another session holds the lights: the shell's light-test row ("An agent is testing an effect on the lights." or "Another editor tab is testing ...", with Stop test) and the button's existing Take over label. (b) A test ended for a reason the user did not cause: the button is back at rest, "Test (15s)"; the reason is announced to screen readers and is the first line of the caret menu, nothing drawn. (c) Test failed to start: a toast.
- **Prompt** (`#s6-prompt`, 6b): title and one line (A); the dialog buttons are centred, as in the editor's naming dialog (the mock's Name field is a title-menu popover with no buttons).

**Proposal frames** (2026-11-12, revisiting the Grille-cou assumptions): `#s6-apply` and `#s6-menu` are live editor frames, not board panels. The title menu matches `TitleMenu.tsx` (Save, Save as new, Save and apply, Rename, New ▸, Open ▸). Save and apply is never disabled for problems: React Aria's Menu skips disabled items on arrow keys, so a disabled row's reason never reaches a keyboard user. Chosen with problems, Save and apply (or Save as new) opens the problems popover headed "Fix N problems to apply" and focuses its first row. Save with problems shows a kept-copy toast. Open ▸ marks a kept copy with a dot only, plus screen-reader text, with no problem count; in the Not saved yet group the items carry no dot and the group heading ends with it (Custom and Built-in keep per-item dots). Arrow keys work in these menus (Up/Down, Right into a submenu, Left back). A refused write leaves the popover closed. The message "Couldn't save. Fix N problems first." shows first, then after a beat (1.45 s) the problems chip, and only the chip, takes the problem node's warning border (`.gn.bad`) and pulses twice, ending as the callout closes. Focus moves to the chip, so Enter opens the list; its ring shows only if the menu was used by keyboard. The callout stays 4.2 s. Reduced motion holds the border without the pulse. The Decisions switch **Refused save** cycles where the message goes: a tooltip-style callout on the chip's left with the warning border (default), the bottom toast, or none (ping only). In these frames the bar title shows the Open ▸ dot next to the name instead of the word Unsaved.

**Open path** (`#s6-openpath`, 2026-11-12): Open ▸ works end to end. Picking an effect loads it: the title changes, a kept copy restores silently (dot on the title, its problems on the chip, no toast or ping), and the effect you left becomes a kept copy with a dot if it had unsaved edits. The current effect is left out of Open, as `openGroups` does. Sample effects cover each case: Slow rainbow (not saved yet, clean), New effect (not saved yet, 2 problems), Sunset (kept, clean), Warm desk lamp (kept, 1 problem), and a long title cut off at 30ch like `.editor-menu-title`, whose full title shows as a tooltip on hover (after 500 ms) or arrow-key focus only when it is actually cut off (Grille-cou's `tooltipOnlyWhenTruncated`). The canvas graph is the same for every effect; only the title, dot and chip change. In Not saved yet every effect is unsaved by definition, so the heading carries the dot instead of the items.

## Button styling A / B / C (`Aurora-u8jx.7`)

Frame **Button styling A/B/C** (`#s7-buttons`, strip group Stage 7). Every editor button type (top bar, Test split, Add node, View, Dashboard controls, drawer, param widgets, shell rows, toast Undo, dialog) drawn three ways side by side, plus an emphasis x state matrix (default, hover, pressed, focus, disabled; states forced through Grille's own `data-*` attributes). A = Grille small button, B = the bar's fixed 32px rule everywhere, C = Rocky Road XR scheme (`panel.css`). A measured-height table at the top reads the drawn buttons. Code is in `buttons.js` / `buttons.css` (scoped to `.bs-a/.bs-b/.bs-c`); the real editor is untouched.

## Preview island (`Aurora-u8jx.6`)

Strip group **Stage 7 Preview**, frames `#pv1` to `#pv10` (the ten frames of the bead's design field). Live, not a board: Test, Stop, the layout select and collapse all work. Code is in `previewisland.js` / `previewisland.css`, hooked into `mock.js` at `drawIslands`, `ACTS`, `FRAMES` and the Test split button. The real editor is untouched.

- Island renamed **Preview**: a card whose first row is one Grille button (`Preview` + chevron, the whole row toggles, like the other dropdowns) that blends into the card when idle and fills on hover, so only the layout button reads as a button, then a Grille menu button for the layout (the same shared menu as the zoom and Test caret menus, tick on the checked row), then the cells. Collapsed it is the same Preview button at its own width. No output label today: with one output "Lights" already names it. A second output (`#pv10`) adds one section per output to the same layout menu, trigger reading `Hue: Lights`, so no second dropdown.
- Layouts are all plain 14 px square cells, 8 per row, like the live island (`ZonesIsland.tsx`): Lights 10, Sim: your room 8, Sim: basic room 4. No quadrant or ring shapes, since those imply screen mapping the island dropped.
- Test is the split button as built (`SplitTestButton.tsx`): `Test (15s)`, `Stop 0:12` while running. The mock's label now follows the code (it said `Test`). Disabled with no lights, reason as its tooltip.
- The dashed text under the frame strip (mock note, announcement, measured width) is mock annotation, not editor UI. The announcement is the Announcer's visually hidden live region, never drawn.
- Scenario toggles (strip, **Preview scenario**): Lights reachable, Saved room map. Flipping them replays the automatic switches, with the Announcer text in a dashed caption. A user pick is never announced.
- Shell: no row for a test the user started (Stage 6 keeps rows for what the user did not cause, and the button reads Stop). With no lights the shell already shows core's `output_link` row, `OutputLinkMonitor.hpp` kUnreachableMessage, drawn as is.
- A running test pins the island to Lights and locks the layout menu (label stays "Lights", tooltip "Showing the lights while a test runs"). Island width is 142 px at rest, 168 px with the longest name (`#pv9` prints it). `Preview 400x800` and `Preview 360x800` open popups.
- Named area (`#pv11` long, `#pv12` short): with a known Hue entertainment area the real layout is named after it instead of "Lights". The layout button follows the title button: capped at 28ch (`.editor-title-menu`), label ends in an ellipsis, the full name shows as a tooltip on hover only when cut off (the tooltip flips left at the window edge). The menu row caps at 30ch (`.editor-menu-title`). A 47-character name makes the card 248 px wide, against 142 px otherwise.
- Frames force the Test split switch on.
- Card color: decided (owner, 2026-11-15) the `#1a1a1a` popup card, same as the other open menus. The `#333` variant was tried and dropped.

Decided (owner, 2026-11-15): Sim: your room is left out of the select when there is no saved map (frame 7). Open: the greyed Lights option carries no reason of its own (React Aria skips disabled options on arrow keys), so a keyboard user hears it from the shell row and the Test tooltip.

## Clipboard (`Aurora-ge1i.2`)

Frame **Clipboard** (`#s8-clip`, strip group Stage 8). Static board in `clipboardmock.js` / `clipboardmock.css`, hooked into `mock.js` at `drawBoard` and `FRAMES`. Nothing is wired and the real editor is untouched.

- Menus follow `web/graph-editor/src/ContextMenu.tsx` (Add node submenu), not the older live Right-click frames, which still show the pre-stage mock menus.
- Canvas menu: Add node (untouched), then Undo, Redo, Fit view, then Paste and Select all. Node menu: Details and Show on the Dashboard, then Cut and Copy, then Delete. Labels are plain Cut, Copy and Delete and act on the selection.
- Platform hints: Redo reads Ctrl+Y on Windows, Ctrl+Shift+Z on Linux, Cmd+Shift+Z on macOS.
- Top bar at 1000, 700, 400 and 360 px: Undo and Redo leave the bar and an Edit dropdown sits beside the title (decided). Captions print the measured widths.
- Toasts: skipped nodes, nothing pasted, clipboard read denied.
- New in the mock: shortcut hints on the canvas rows, the platform hints, the toast sentences.

## Stage 10 controls panel (`Aurora-e4bi.1`)

Not in this static mock. It is a dev-only React page so it runs on real Grille and React Aria (Tree drag and drop): `web/graph-editor/controls-mock.html`, code in `web/graph-editor/src/mock/`. Run `npm run dev` in `web/graph-editor` and open `/graph-editor/controls-mock.html`. The strip switches data (audio, long names, General only, empty) and the head (x with divider, chevron close), and opens popups at 1100, 700, 400, 360 and 900x1400. It is not part of `vite build`.
