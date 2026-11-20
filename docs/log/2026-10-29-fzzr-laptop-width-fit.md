# Graph editor: fit holds at laptop width

Id: fzzr-laptop-width-fit

`Aurora-fzzr`: the E6 gate needed a 2200 px window because at 1500 px drags
landed under the inspector. Real, not a lasting overlap and not a shift after
load. At 1470 px `builtin.video` opened with its right-hand nodes (x 1299–1609)
under the inspector (canvas 205–1165) and they never moved.

- Two causes. The palette and inspector rendered only once the catalog and
  graph arrived, so the canvas was first fit at full width and then shrank.
  And React Flow's default `minZoom` 0.5 clamped the fit: the graph is about
  2340 flow-px wide and cannot fit 960 px at 0.5.
- Fix in `App.tsx`: empty `.palette` / `.inspector` placeholders hold the panel
  widths while loading, and `minZoom={0.2}`. Sampling node boxes and the
  viewport transform from page start: canvas 960 px from the first frame, fit
  at scale 0.37 (1470 px) and 0.30 (1280 px), all nodes inside the canvas.
- The gate window is now 1470 px (`graph-editor-gate.mjs`, README); gate passed
  4 of 4 runs. Edit-loop and add-node checks not rerun.

- Lessons: none.
