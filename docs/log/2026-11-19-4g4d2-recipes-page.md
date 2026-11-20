# Effect recipes page: read-only editor viewer, seven canon clips

Id: 4g4d2-recipes-page

`Aurora-4g4d.2`, the build of the page decided in `Aurora-4g4d` and mocked in `Aurora-4g4d.1` (decision text: [[node-conversion-gaps]], "Publishing the recipes"). Users get a page of canon graph recipes. Each recipe is drawn with the editor's own nodes and has a Copy button that puts a clip on the clipboard for Ctrl+V in the graph editor. Source and notes: [[effect-recipes]].

## What shipped
- **Viewer** (`web/graph-editor/src/recipes/`): reuses `GenericNode`, `ParamWidget`, `toFlowNodes`, `toFlowEdges`, `parseClip`, `ViewMenu` (no minimap item). `ReadOnlyContext` disables the inputs and hides the node menu. Built apart from the editor (`npm run build:recipes` into `dist-recipes/`, `web/demo/vendor/build-recipes.py` copies it to `web/demo/recipes/`), so it never lands in the binary's embedded map. The catalog is the editor's `server-samples/nodes.json`, so the page needs no running Aurora.
- **Page**: Grille `Header`, `Tabs` as recipe pills (wrapped, centered), a `Menu` picker with a checkmark under 650 px, Copy as `Button size="action" variant="primary"`, an Outline switch (the editor's `.toggle-switch`) and a light word-balloon "Paste into graph editor with Ctrl+V" (Cmd+V on a Mac, from `graph/keys.ts`). Two columns on wide screens, centered against each other. Narrow: text, then Copy and the switch in one row.
- **Outline**: a generated box-and-wire SVG from the same clip. Under 650 px the same layered layout turned 90 degrees (titles only, widest layer sets the box width, no sideways scroll). The node-by-node text list stays in the page, visually hidden, as the viewer's text alternative.
- **Layout**: `layered` in `graph/layout.ts` (columns by longest path, sources beside their consumer, tops level, lanes for wires that skip a column), run from estimated sizes and again from measured ones. The clips' saved `ui` came from that measured layout.
- **Clips**: seven in `docs/recipes/`: Complementary colors, Loudness switch, Bass/mids/treble as RGB, VU meter fill, Beat-stepped chase, Candles (owner's, positions kept), Audio color over the screen. All are whole graphs ending in `output.send`, so they paste into an empty graph. Complementary colors began as a one-node fragment and became the Screen colors chain with a hue shift, because a lone node was not usable and its name did not say what it did.
- **CI**: `recipes.test.ts` (in `npm test`) runs every clip through `parseClip` and `pasteSelection` against the catalog sample, checks port types with `refuseConnection`, param ranges, Tuning targets, required inputs, and that the outline and the turned outline have every node and wire and fit 340 units. `web.yml` also triggers on `docs/recipes/**` and builds the page. `tools/browser-check/checks/recipes-page.mjs` drives the built page.
- **Candles output**: an empty `output` binding fails when the node runs (`needs param 'output'`), so the clips keep `hue`, the one registered output. No change needed.

## Decisions (owner, 2026-11-19)
- v2 replaced the "Header and Button only" page: pills for recipes, a menu picker on phones, Needs lines and the fragment callout cut, the Graph/Outline tabs replaced by one switch.
- Reflow over scroll: the narrow outline fits the width. A scroller would need `tabindex="0"`, `role="region"` and a name.
- Weight of the built page: JS 667 kB (203 kB gzip), CSS 74 kB (12.8 kB gzip), notices 64 kB.

## Verification
- `npm run typecheck`, `npm test` (351 tests) pass. `checks/recipes-page.mjs` passes in headless Chromium: 7 pills, per recipe read-only viewer (nodes, wires, no node menu, inputs disabled, handles inert, credit), text list present and visually hidden, Copy text equal to the clip file, balloon words, View menu, Outline switch, refused clipboard write shows the text selected, keyboard, phone menu checkmark and pick, and no sideways scroll at 1100, 700, 400 and 360 px.
- Not checked: any recipe pasted into the editor on the fake-lights stack, audio recipes on real lights, a Mac key hint, the balloon pointer visually at 360 px, a real screen reader. Filed as `Aurora-4g4d.3`.
- The phone graph view still opens fit-all (14 to 19 percent for wide recipes), readable only through the Outline switch or pinch.

## Lessons
- [[lesson-components]]: a controlled React Flow never learns node sizes without `onNodesChange`; handles stay `connectable` whatever the flags say; Grille `Tabs` mount hidden panels and `Select` marks the choice only in bold.
- [[lesson-layout-css]]: lay a graph out from measured sizes, tops level, lanes for wires that skip a column; a word-balloon popover needs its frame stripped and its pointer aimed from measured rects.
- [[lesson-web-testing]]: `isVisible()` is true for a visually hidden element, and padding counts toward its width.
- [[lesson-debugging-method]]: a file written from a Bash heredoc can end mid-line, so check its tail.
