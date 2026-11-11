# Graph editor mock on Grille

Copy of `../Static_GraphEditor_Mocks` (`Aurora-bova`) built on Grille `0.1.0-dev.8` for `Aurora-daaa.31`,
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
- Placement carried over from the mock: `+ Add node` labelled on the canvas top-left, problems chip and preview status in the right group before Undo, dividers after the back link and before Test on lights, Dashboard controls bottom-left with a muted count, zoom menu bottom-right, collapsible Zone preview top-right, problems popover dropping from the chip.
- Zoom menu bottom-right. React Flow's credit sits bottom-centre in small muted text (`attributionPosition="bottom-center"`). The credit is kept: React Flow's docs ask that only Pro subscribers hide it (`proOptions.hideAttribution`), with no stated exception for personal or open-source use.
- Menus, drawers and the add node menus keep the original mock's own markup, recoloured with Grille tokens. They are not Grille components.

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
