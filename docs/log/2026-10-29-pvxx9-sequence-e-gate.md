# E6: Sequence E gate on the fake-Hue stack

Id: pvxx9-sequence-e-gate

`Aurora-pvxx.9`: `tools/browser-check/checks/graph-editor-gate.mjs`
(`npm run graph-editor:gate`), one pass on the dummy input.

## Done

- Steps: open `builtin.video` with a live preview; delete a wire (badge and
  problem count); drag it back (badge gone, preview live); drag a node; test on
  lights, a second session takes the test (editor names it); Save as new;
  reload the page and reopen (node sits at the saved `ui` position); edit a
  param, Undo, Redo; `PATCH /api/v1/state {running:false}` (status says paused).
- `AURORA_EDITOR=embedded` runs the same script against the editor built into
  the app.

## Results

- macOS (2026-10-29): dev server and embedded both exit 0.
- Windows and Linux: not run yet, so the bead stays open for them.
