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

## Aurora-pvxx.15: stronger script

- Rewire: waits for a thumbnail that differs from the held one and is not
  stale. Undo/redo: gain 0.4 must dim the thumbnail below 80% of its brightness.
- `devstack.py restart` relaunches the app on the same config root (pinned
  with `AURORA_CONFIG_DIR`, no `--fresh`); the gate reopens the saved effect
  and checks the layout.
- Palette: add Gain, wire it in. Save as new from the custom copy.
- Preview states: second `EventSource` on the tab session (taken over,
  Reconnect); builtin.audio PUT as the tab's draft with no audio input
  (draft would not load); 16 draft slots filled, new tab session (Draft not
  sent, too_many_drafts).
- The window is 2200 px wide: at 1500 the palette pushed nodes under the
  inspector and drags missed (the old script failed about half its runs).
- Also fixed a race in the save-as-new check (count nodes before they render).

## Lessons

- Lessons: none (a stale embedded binary and a layout shift from a new panel both showed up as drag flakes; the gate now fixes the window size).

## Results

- macOS (2026-10-29): dev server and embedded both exit 0 with the .15 script (embedded after rebuilding `mac-app`; the older binary lacked the palette).
- Windows 11 (2026-11-18): dev server and embedded (Release, `AURORA_ENABLE_GRAPH_EDITOR=ON`) both exit 0, 17 steps each.
- Linux: not run. Owner closed `Aurora-pvxx.9`, `Aurora-pvxx.18` and the epic `Aurora-pvxx` on 2026-11-20 with Mac and Windows evidence. The editor is the same web code on every OS, and Aurora has run on Wayland and X11 since.
