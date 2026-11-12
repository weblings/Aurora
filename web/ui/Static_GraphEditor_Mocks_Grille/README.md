# Graph editor mock on Grille

Copy of `../Static_GraphEditor_Mocks` (`Aurora-bova`) built on Grille `0.1.0-dev.11` (grille/ refreshed from node_modules, Aurora-u68h.1) for `Aurora-daaa.31`,
so the layout can be judged with real Grille styling before the editor changes. The original mock is untouched.
Open `index.html` directly. Frames work as in the original (`#rest`, `#problems`, `#testing`, `#changed`, `#reconnect`, ...).

`grille/` holds `tokens.css`, `ui.css`, `fonts.css` and the Inter files copied from
`web/graph-editor/node_modules/@weblings/grille/dist`. Copy them again after a Grille bump. `gen.py` is as before.

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
- Below 650 px wide, or aspect under 0.75 (`max-aspect-ratio: 3/4`), the drawer docks at the bottom at half the canvas height. An expand / collapse icon button (the Zones resize icons; tooltip Full height / Half height) sits in its header, and the close button is the Vidstack x mark. The editor's node-clear pan is not mocked.
- Zone preview: with a side drawer open it steps left of the drawer; with the dock open it stays top-right above it. In both it stays visible, large map included (check at 400x800).
- Bottom corner buttons: with a side drawer open, Dashboard controls steps left of it (so it can still close the drawer) and zoom stays bottom-left. With the dock at half height both lift above the sheet. At full height they are deliberately hidden, as is the React Flow credit; the toggle or close brings them back. In the editor the cells would be DOM elements, not the thumbnail's canvas (zone counts are small until LED strips are supported).

## Node-shape changes (`Aurora-1cmx`)

Tried here before the editor builds them (`Aurora-d0hv`, `Aurora-jsjj`, `Aurora-0veq`).

- **Circle sockets**: every socket is a circle in its domain colour (video teal, audio violet, light amber, numbers gray). The `diamond`/`triangle` classes are gone. The wire now carries the difference: Image, AudioBuffer and Frame wires are thicker (3.5 px), Trigger wires are dashed.
- **Converters**: `angle.fromFloat` and `angle.toFloat` (param `scale`, default 360) are mock-only entries pushed onto the catalog in `mock.js`; `catalog.js` is not edited. They sit in the **Numbers** group next to `angle.add`: they are pure number-to-number maths like the rest of that group, while Motion holds nodes that keep state over time. Drop the mock-only entries when `gen.py` is next run after `Aurora-jsjj` lands.
- **Refused wire**: the existing Image to Frame frame is unchanged; a new **Refused: Float to Angle** frame names the converter in its toast.
- **Auto-insert** (**Auto-insert converter** frame): a Float wire dropped on an Angle input leaves `angle.fromFloat` as a visible node (outlined as new), wired on both sides and placed between the two nodes, clear of both. Undo would treat the drop as one step: the node and both wires go together and the original Float wire is not needed back, since it was never made.

## Stage 6 board (`Aurora-u68h.1`)

Frames **Stage 6** in the strip (`#s6` all four, `#s6-shell`, `#s6-test`, `#s6-open`, `#s6-prompt`): a static board, not the editor, showing where each editor message lives once the banner under the bar is retired. Shell rows (6a, shell.css look), the Test button outcome mark (6c), the title menu with Open groups, dots and description lines (6d), and the changed-saved-effect Modal in two wordings (6b). Open menu description lines are drawn in mock CSS: Grille dev.11 hides MenuItem descriptions (visible line pending Grille-cou). Owner review recorded on the bead.

**Proposal frames** (2026-11-12, revisiting the Grille-cou assumptions): `#s6-apply` and `#s6-menu` are live editor frames, not board panels. The title menu matches `TitleMenu.tsx` (Save, Save as new, Save and apply, Rename, New ▸, Open ▸). Save and apply is never disabled for problems: React Aria's Menu skips disabled items on arrow keys, so a disabled row's reason never reaches a keyboard user. Chosen with problems, Save and apply (or Save as new) opens the problems popover headed "Fix N problems to apply" and focuses its first row. Save with problems shows a kept-copy toast. Open ▸ marks a kept copy with a dot only, plus screen-reader text, with no problem count. Arrow keys work in these menus (Up/Down, Right into a submenu, Left back). The `#s6-open` board panel now shows the same thing, without the description lines. A refused write leaves the popover closed. The message "Couldn't save. Fix N problems first." shows first, then after a beat (1.45 s) the problems chip, and only the chip, takes the problem node's warning border (`.gn.bad`) and pulses twice, ending as the callout closes. Focus moves to the chip, so Enter opens the list; its ring shows only if the menu was used by keyboard. The callout stays 4.2 s. Reduced motion holds the border without the pulse. The Decisions switch **Refused save** cycles where the message goes: a tooltip-style callout on the chip's left with the warning border (default), the bottom toast, or none (ping only). In these frames the bar title shows the Open ▸ dot next to the name instead of the word Unsaved.
