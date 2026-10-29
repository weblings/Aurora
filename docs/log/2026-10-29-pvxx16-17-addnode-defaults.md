# Graph editor addNode defaults: optional-floats and output bindings

Id: pvxx16-17-addnode-defaults

`Aurora-pvxx.16` and `Aurora-pvxx.17`, found in the E6 gate drift review: a node
added from the palette started with params the catalog defaults get wrong.

- `.16` (5f7f0f9): `addNode` leaves optional-float params unset; the catalog
  default is only a display placeholder.
- `.17`: the output enum (`output.send`, `zones.sample`, `frame.smooth`,
  `frame.broadcast`) defaults to `""`, which badged the new node, and the select
  showed `hue` while the document held `""`, so picking it fired no change.
  `addNode` now starts an enum on its first option when the default is not an
  option, and the select shows a disabled "choose..." for a value that is not an
  option.
- Vitest: `addNode` of the four output-bound types gives `hue`; the enum widget
  renders the placeholder (markup only, no simulated pick). `graph.test.ts`
  became `.tsx` to render the widget.
- Gate: `graph-editor-gate.mjs` adds "Send to output" from the palette, asserts
  no badge and `hue` selected, then deletes it. Passes on the Mac dev server and
  on the embedded editor (`mac-app` rebuilt).

- Lessons: none.
