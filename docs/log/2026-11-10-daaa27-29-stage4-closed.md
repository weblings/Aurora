# Graph editor: stage 4 and narrow windows closed

Id: daaa27-29-stage4-closed

`Aurora-daaa.27`, `Aurora-daaa.29`. Parent closures after all children landed; no code change.

- `Aurora-daaa.27` (stage 4): `.27.1`-`.27.5` closed. Inspector gone, checks migrated including the gate script, control count 9 [[daaa27-4-inspector-removed]], bundle reported at [[daaa28-grille-drawer]], Esc from anywhere on Grille dev.8 with the App.tsx handler removed.
- `Aurora-daaa.29` (narrow windows): `.29.1`-`.29.5` closed. Top bar shrink, drawer width and pan, bottom dock, 1100 px no-pan check [[daaa29-5-narrow-leftovers]].
- [[graph-editor-cleanup]] status line now names Grille `v0.1.0-dev.8`, `.27.5`, `.29.5`, the full check run and `Aurora-daaa.16` as what is left in the epic.

## Verification

- Full graph-editor browser-check suite green on the stage 4 head [[daaa30-full-browser-check]]; `check-links.py` passes.

## Lessons

- none
