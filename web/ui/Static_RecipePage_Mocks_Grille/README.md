# Recipes page mock on Grille

Static mock for `Aurora-4g4d.1`. Open `index.html` directly. Frame strip: `#a`, `#c`, `#b`.
`grille/` is a copy of `../Static_GraphEditor_Mocks_Grille/grille` (recopy after a Grille bump).

- **A** (`#a`): flat list, chain drawn as an SVG from nodes, edges and positions. Under 650 px it becomes a text list.
- **C** (`#c`): same flat list, chain as a fixed raster stand-in (an SVG in a dark box).
- **B** (`#b`): master-detail (nodes and wires drawn in the editor's look from catalog data: titles, typed circle sockets, param rows, wires colored by source port type, 3 px for bulk types, 2 px otherwise, Trigger dashed, bold open required inputs), recipe list plus one viewer. The viewer is a stand-in for ReactFlow that copies the editor: fit on load with minZoom 0.6 and maxZoom 1 (`ViewMenu.tsx` `FIT_OPTIONS`), drag to pan, wheel or the editor-style View menu to zoom (0.2 to 2), primary Copy, React Flow credit bottom-centre.
- Three recipes: Candles (a whole graph with two sources, from docs/recipes/candles.clip.json), Loudness switch (branching) and Bass/mids/treble as RGB (three parallel chains, the stress case for A's text list and B's fit).
- The strip's **Meta lines** switch compares the card meta: `Needs` line plus exception notes (pitch, default) against In / Out / Layout (current). Data is inline in `mock.js`, not read from clip files.
- Only Grille `.ui-button` and the section-header style are used. Copy shows a 2 s "Copied" state.
- The bottom line prints the measured window, card and chain sizes.
- Not judged here: viewer bundle weight and pan/zoom feel (needs the real editor in a narrow window), the real `Header` component (this is static CSS only).
