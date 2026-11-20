# Graph editor stage 2 in the embedded build

Id: daaa13-embedded-run

`Aurora-daaa.13`. Ran the stage 2 browser checks against the editor built into the Mac app (`AURORA_EDITOR=embedded`, `/graph-editor/` base), on the fake-Hue stack with the dummy input.

## State

- `cmake --preset mac-app` and a full build of `build/mac-app` succeeded (graph editor ON).
- Passed embedded: `graph-editor:title-menu`, `:top-bar`, `:back-link`, and `npm run graph-editor` (the edit loop, there is no `:edit-loop` script).
- Screenshots at 1470x900 from the embedded build, each looked at: title menu, view menu and problems popover all draw a surface (background, border), so the `tokens.css` and `ui.css` imports and the portal layer work under the embedded base.
- The edit loop failed at "Name gets focus after Save on a built-in" on the dev server and embedded alike. Cause: the check read focus in the same frame the Name field mounted, and the editor focuses it a few frames later (`TitleMenu.tsx`). The check now waits up to 3 s for focus. This had been hiding since `Aurora-daaa.11` (its log says the edit loop passed; it was timing).
- `builtin.audio` reviewed: two layout problems filed, see below.

## Verification

- Dev-server rerun of the edit loop failed before the check fix (same assertion), so the failure was not embedded-specific. Embedded edit loop passed after.
- Not checked: Windows and Linux embedded builds, narrow windows.

## Findings filed

- Problems popover rows are cramped: bold node id at left, message wrapped to a narrow column, five lines tall. Filed under `Aurora-daaa`.
- `builtin.audio` fits at 37% (node text unreadable, thin strip mid-canvas), and with the preview paused the top-right thumbnail is an empty box. Filed under `Aurora-daaa`.

## Lessons

- Lessons: filed in `docs/lessons/web-testing.md` (a check that reads `document.activeElement` right after an element appears races a later-frame focus).
