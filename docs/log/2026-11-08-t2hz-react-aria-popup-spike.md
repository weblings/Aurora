# React Aria popup spike for the graph editor

Id: t2hz-react-aria-popup-spike

`Aurora-t2hz`, feeds [[graph-editor-cleanup]]. Result: go on React Aria popups, with workarounds.

## State

- Throwaway build of `react-aria-components` 1.22.1 on the editor canvas, driven by a Playwright
  script on the fake-Hue stack (headless Chromium, 1470x900). Branch and worktree deleted, nothing merged.
- Q1 yes (pointer-anchored Popover on canvas, node and wire right-click). Q2 yes (Autocomplete,
  SearchField, sectioned list), but name-first ranking needs our own sort. Q3 partly (Delete and
  Backspace still reach React Flow, focus does not return). Q4 partly (4px ring clipped 3px a side at
  zero padding). Q5 modal no, `isNonModal` yes.
- Findings, workarounds and the Grille API needed are in the `Aurora-t2hz` notes and the
  "Scoping concerns" section of [[graph-editor-cleanup]].

## Verification

- Every number above came from the browser script's output, rerun after fixing harness artifacts
  (a leaked `a` keypress, a menu left open between steps).
- Not checked: GrilleDS itself (not installed), its real CSS, the `.ui-listbox` ring, touch.
- Surprise: `git worktree remove --force` followed a junction to the main `build/` and deleted part
  of it (regenerable, gitignored). Filed as a lesson.

## Lessons

- 2 new: `docs/lessons/components.md` (React Aria on React Flow) and `docs/lessons/windows-env.md` (worktree junction deletion).
