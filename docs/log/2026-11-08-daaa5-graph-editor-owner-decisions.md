# Graph editor cleanup: owner decisions before stage 2

Id: daaa5-graph-editor-owner-decisions

`Aurora-daaa.5`. Seven owner decisions, recorded in `docs/planning/WebUI/GraphEditorCleanup.md` (Decisions). Unblocks `Aurora-daaa.7`, `.8` and `.9`.

## State

- Cleanup runs before the Sequence E gate. `Aurora-pvxx.9` now depends on `Aurora-daaa.11`, so the Windows and Linux gates run once on the final UI.
- Grille takes Aurora's popup surface and shadow, and `Select` picks it up. A no-shadow WebXR variant is untested and deferred. A light Dashboard effect dropdown was tried with tokens only and rejected: a large light popup is jarring against the dark UI.
- +60 kB gzip accepted. Desktop only for this pass (`web/graph-editor/README.md`). Effect switcher stays in the title menu, no unsaved warning.
- The title menu is a Dialog in a Popover holding Save, Save as new, Save and apply, Rename, Open another effect and New. The Save split button, the toast idea and Keep after a test are dropped; a test shows Revert only. The mock (`web/ui/Static_GraphEditor_Mocks`) matches.
- Grille work is tracked by beads in `weblings/GrilleDS` (prefix `Grille`): `Grille-251` (G1, Aurora `daaa.7`), `Grille-48x` (G2 and G3a, Aurora `daaa.8`), `Grille-h7g` (G3b). The GrilleDS beads files are not committed.

## Verification

- Fake-Hue stack, dummy input: Save and Save and apply during a running test leave `GET /api/graph/test` at `active: true`, while apply sets the active effect. So Save and apply must end the test itself (`Aurora-daaa.10`). Not checked: what the lights show between an edited-graph apply and the test ending.
- Server code: Save on the running custom effect already reloads the pipeline (`ApplyRoutes.hpp`), so Save and apply only differs for an effect that is not running.

## Lessons

- Lessons: none.
