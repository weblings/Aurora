# Inset focus ring on Grille Select options

Id: 4nqt12-select-option-inset-focus

`Aurora-4nqt.12` (P3). Aurora's global `:focus-visible` ring drew outside Grille's `.ui-option` and overlapped the neighbouring rows and the popup edge.

- `web/ui/styles/tokens.css`: `.ui-option:focus-visible` joins the inset-ring rule that `.segmented-btn` and `.dropdown-option` already use.
- Re-ran `sync-webui.py`: the demo copy of `tokens.css` and the manifest commit were updated. `seams.test.mjs` and `closure-check.mjs` pass.
- The same rule was already in the mock (`web/graph-editor/src/mock/gapsMock.css`), so the editor look is the one approved there.

## Check
- Browser check on `gaps-mock.html` (Vite dev server, headless Chromium): the mock's own `.ui-option:focus-visible` rule was deleted from the CSSOM so only `tokens.css` applied. A keyboard-focused option then computed `outline: 2px solid` with `outline-offset: -2px` (inset), `:focus-visible` true. No screenshot was kept.

## Not resolved
- The Dashboard has no Select until `Aurora-4nqt.7`, so its half of the criterion is re-checked there. The shared `tokens.css` rule is the same.
