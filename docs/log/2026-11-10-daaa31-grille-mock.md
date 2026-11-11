# Graph editor mock rebuilt on Grille

Id: daaa31-grille-mock

`Aurora-daaa.31`. `web/ui/Static_GraphEditor_Mocks_Grille/` is a copy of the `Aurora-bova` mock on Grille dev.8 (`tokens.css`, `ui.css`, `fonts.css` and Inter copied into its `grille/`). The original mock is unchanged. Back link reads "← Dashboard". Frame strip "Decisions" toggles: back link and title boxed vs a local borderless variant, Test on lights primary vs secondary. The README lists every difference from the original. Placement is in [[graph-editor-cleanup]].

- The original mock already had the target placement; the work was restyling, not moving.
- Grille's hover, press and focus styles key off react-aria data attributes, so a static page needs `:hover`, `:active` and `:focus-visible` fallbacks.
- Grille's primary button is the large form size, so the bar's primary needs a local small-size override.
- React Flow's credit sits bottom-centre in the mock (`attributionPosition="bottom-center"` in the editor). Its docs ask that only Pro subscribers hide it (`proOptions.hideAttribution`) and state no personal or open-source exception, so it is kept. An earlier search snippet claiming personal use is fine was not found on the official pages.

## Verification

- Opened At rest, Problems, Testing, Edited during test and Reconnect in headless Chromium: no console errors. Screenshots read for At rest, Problems and the toggled state only.
- No `../styles` or `../icons` references remain.

## Lessons

- none
