# Effect recipes

Id: effect-recipes

Status: shipped as the recipes page (Aurora-4g4d.2, [[4g4d2-recipes-page]]). Paste checks on the fake-lights stack and the Pages deploy are Aurora-4g4d.3.

One `<name>.clip.json` per recipe: the exact text Copy puts on the clipboard, in the
editor's own clip format (`aurora-graph-clip`, read by `parseClip` and
`pasteSelection`). `recipes.json` holds what the page shows beside each clip (name,
description, Needs, paste target, layout note). Tuning controls and the card's
"Comes with N Tuning controls" line come from the clip.

- Add a recipe: copy a selection in the editor (Ctrl+C), save the text as
  `<name>.clip.json`, add its entry to `recipes.json`. The drift test fails until
  both exist.
- Drift test: `web/graph-editor/src/recipes/recipes.test.ts` runs every clip through
  `parseClip` and `pasteSelection` against the catalog sample and checks ports, types,
  params and Tuning targets, so a renamed node or port fails the build.
- All seven are whole graphs ending in `output.send` and paste into an empty graph. A second `output.send` is skipped on paste.
- Audio levels are small and jumpy: `rms` and the band levels run about 0.01 to 0.15 on real
  music (treble well below bass). Remap them with `math.mapRange` before they drive brightness, a
  mix or a threshold, and ease them (`smooth.exp`, then `frame.smoothTime` on the output) or the
  lights strobe. Tuned in [[ppqo-audio-recipes-tuned]].
- Output binding: a graph with an `output.send` names its output (`hue`, the one
  registered output). The loader fails an empty binding when the node runs, so the
  clips keep `hue` rather than leaving it unset.
- Page: `npm run build:recipes` in `web/graph-editor` (or
  `python web/demo/vendor/build-recipes.py` for `web/demo/recipes/`). It reuses the editor's
  nodes, wires, zoom and View menu read-only; `npm run dev:recipes` serves it with reload. Positions in a clip's
  `ui` came from the page's measured layout, so regenerate them if the layout changes.
  `tools/browser-check/checks/recipes-page.mjs` checks it in a browser.
- Planning: [[node-conversion-gaps]] ("Publishing the recipes").
