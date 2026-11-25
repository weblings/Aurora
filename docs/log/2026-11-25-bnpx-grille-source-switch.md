# Grille source switch tool

Id: bnpx-grille-source-switch

`Aurora-bnpx`, closed. The tool landed with [[vtm5-export-graph]] while the bead stayed open.

- `tools/grille/switch.mjs` points `web/graph-editor` at a GitHub dev tarball or an npm release, run as `npm run grille -- dev|release|status|check`.
- `check` exits 1 unless the pin is an exact npm version. No CI job or hook runs it, so it is a manual pre-release step.
- Usage is in `tools/grille/README.md`.

## Verification
- `release 0.2.2` switched the editor ([[aiy2-grille-0-2-2-npm]]).
- `check`, run on a scratch copy, exited 1 on the dev.5 tarball pin and 0 on the npm pin.
- The `dev` command was not rerun at close.

## Lessons
- [[lesson-build-toolchain]]: a GitHub tarball pin brings back npm 12's refusal.
