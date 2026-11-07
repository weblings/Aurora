# Graph editor mocks

Static mocks for `Aurora-bova`: the cleaned-up layout, three add node menus, right-click
menus, drawers and states. One live page, not a set of frames, so search, keyboard, menus,
pan and zoom can be tried. The dashed strip at the top switches frames and is not part of the design.
Proposal, open directions and sequencing: [[graph-editor-cleanup]].

Open `index.html` directly, or serve `web/ui` and open `/Static_GraphEditor_Mocks/`. A frame
has its own hash, such as `#browser-search`.

- `gen.py` writes `catalog.js` from the graph editor's server samples, so the node list is real.
  Run `python gen.py` after those samples change.
- `mock.css` and `mock.js` are hand-written. Styles build on the real `../styles` tokens and forms.
- The seven add menu groups live in `CATEGORIES` in `mock.js`. A node missing from them logs a console error.
