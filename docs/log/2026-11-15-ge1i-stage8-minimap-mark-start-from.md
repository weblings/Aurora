# Graph editor stage 8: minimap contrast, unsaved *, New from any effect

Id: ge1i-stage8-minimap-mark-start-from

`Aurora-ge1i.1`, `Aurora-ge1i.3` and `Aurora-ge1i.4`, epic `Aurora-ge1i` (plan [[graph-editor-cleanup]], Stage 8). Built by three agents, `.1` and `.3` in parallel in one tree, `.4` after. `.1` and `.3` were committed as 829c5757 and 304245ec before this entry; this entry is their log.

## What changed

- `.1` minimap: nodes use `--aurora-text-secondary` at 0.6 fill opacity with no stroke (about 4.5:1 on `--aurora-surface`, was 1.2:1); the viewport outline is text-secondary too. Scrim mask and background unchanged. `--aurora-accent` at 0.6 would only reach about 2:1. Problem-node colouring (optional) skipped: it needs problem state in the minimap.
- `.3` unsaved mark: a trailing `*` in its own non-shrinking span replaces Grille's `dotIcon` on the title, dirty Open items and the Not saved yet heading (the Open marks follow the title, coordinator decision in the bead notes). Screen-reader text `unsaved changes` and `data-unsaved` unchanged. Revises the stage 6 dot decision. `graph-editor:refused-save` asserts the `*`.
- `.4` New: Empty and the built-ins stay flat (same `startPoints` rule as the dashboard), then Custom and Hidden sub-menus from the dashboard's `buildGroups` (imported). Hidden holds hidden custom effects only, since hidden built-ins are already flat. A pick fetches the source, seeds `X (Copy)` (`copyOf`, via `distinctTitle`) under a fresh draft id, and the loader opens the seed over the blank baseline, so it is unsaved and written nowhere until Save. A Duplicate item copies the open doc, unsaved edits included, the same way. Empty stays the blank graph; the dashboard's Start from still opens the built-in itself (follow-up if wanted). Revert to saved on a seeded copy goes to the blank graph.

## Verification

- Editor typecheck clean, vitest 240/240 (startGroups and copyOf cases added), build clean; `web/ui/EffectPanelModel.test.mjs` passes.
- Browser checks pass after each bead: `graph-editor:title-menu` (extended: flat items, Custom and Hidden flyouts, a pick opens `(Copy)*` under `@new-` with no write to `/api/effects` or `/api/graph/save|apply`), `save-as-new`, `kept-copy`, `refused-save`, `narrow`, `gate`, `effect-panel`.
- `graph-editor:top-bar` fails at its 31 px assertion on the base commit as before (`Aurora-ma8m`).
- Screenshots looked at: minimap at 1470 and 400 px, title `*` at 1470 and truncated at 400 px, Open with `Not saved yet*`, New with the Hidden flyout.
- Not covered by a check: Save after a seeded New, reload of a seeded copy, Duplicate beyond its menu entry.

## Lessons

- On Windows the browser-check stack needs a mkdir lock, and Node needs C:/ paths
