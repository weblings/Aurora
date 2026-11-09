# Graph editor title menu: Save, Save as new and Save and apply

Id: daaa10-title-menu

`Aurora-daaa.10`. The three file actions leave the action row for an "Effect menu" button (labelled with the effect title) that opens a Grille `Dialog` + `Menu` in the editor's first shared popup.

## State

- `src/EditorPopup.tsx` wraps Grille's `Popover` for every later editor menu. Non-modal; Delete and Backspace stopped inside it (Esc is not); a capture-phase press outside closes it, which also covers a pane drag; a document Esc closes it with focus anywhere; focus returns to the element active at open (else the trigger). Arrow keys only move focus.
- Save as new is absent for a built-in, as the button was. Items are disabled while a write runs; the trigger is not, so focus stays put. The menu closes before the write starts.
- Keep is gone: a test shows Revert only. `keepTest`, `useLightTest.keep`, `forWrite`'s `keep` argument and the `tested`/`changedSinceTest` state are removed.
- Save and apply during a test ends it: `apply`, then `revertTest` (hook `finishAfterApply`), shown as "Kept". The server's revert reads the live config and effect file fresh, so after apply it rebuilds the applied graph, not the pre-test one. An unchanged graph and an edited one take the same path. Plain Save leaves the test running.
- The Name input stays on the action row for now; `Aurora-daaa.11` reworks the bar.

## Verification

- New check `graph-editor-title-menu.mjs` (`npm run graph-editor:title-menu`): mouse and keyboard open, Esc inside and outside the menu, outside click, pane drag, focus return, arrows save nothing, and Backspace not deleting the selected node while open. With the key block removed from `EditorPopup` it fails; restored, it passes.
- Migrated: edit-loop (Keep steps replaced by two Save-and-apply-during-test steps: graph as tested, graph edited; both end with `GET /api/graph/test` `active: false` and the right live effect and title), save-as-new, add-node, gate.
- Control count 84/132 to 83/131 (`CEILING` lowered).
- `tsc`, Vitest (98) and the Vite build pass. All checks ran on the Vite dev server over the fake-Hue stack, dummy input.
- Not run: `AURORA_EDITOR=embedded` (no CMake rebuild), and CI. The lights between the apply and the revert with an edited graph are untested on hardware.
- Space on a focused item activates it, so Space-pan is unavailable while a menu has focus (accepted in the spike).

## Lessons

- Lessons: none.
