# Graph editor stages 5 and 6: epics filed and noted in the plan

Id: s1t7-stage5-6-planning

`Aurora-s1t7`, `Aurora-u68h`, `Grille-ky2`. Planning only, no code. [[graph-editor-cleanup]] now has a "Stages 5 and 6" section; follows [[s1t76-mock-switches-decided]].

## Filed

- `Grille-ky2` (GrilleDS): icons for Aurora and RockyRoad. Vendored Vidstack, Zest and Aurora SVGs, a React `Icon`, a plain-SVG export for pages without React, Drawer and Select glyphs, a dev prerelease. No new runtime dependency: `@vidstack/react/icons` pulls in the whole player package, and the npm `zest-icons` needs React 16.
- `Aurora-s1t7` (stage 5): editor to the Grille mock. `.1` Grille buttons and the 32 px bar, `.2` problems chip, `.3` canvas corners and minimap, `.4` Zones island, `.5` icons (waits on `Grille-ky2.5`), `.8` close-out. `Aurora-daaa.35` moved under it. `Aurora-daaa.16` (Grille v0.1.0) was briefly moved under it too and put back under `Aurora-daaa` the same day: it is the end of the whole process, not part of stage 5 (owner).
- P4 follow-ups: `Aurora-0ofk` (Dashboard on Grille's icons), `Aurora-sy6t` (Vidstack credit in the `-rockyroad` play and pause files).

## Recorded in the plan

- Owner decisions at the mock review: Dashboard controls bottom-right, minimap above zoom with the View menu opening above it, the Dashboard diamond cut, one icon set owned by Grille.
- Stage 6 to explore moving the problems UI (chip and popover) into the error shell, tried in the Grille mock first when the epic starts. Noted on `Aurora-u68h`, `Aurora-s1t7.9` and `Aurora-s1t7.2`. [[error-overlay]] already has a collapsed `N problems` summary.

## Verification

- Doc checks only (lessons, links). Repo builds and tests not run (planning only).

## Lessons

- none
