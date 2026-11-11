# Graph editor: top bar on Grille buttons

Id: s1t71-bar-grille-buttons

`Aurora-s1t7.1`. The bar's controls (back link, title, `+`, Reconnect, problems chip, Undo/Redo, More, Test on lights/Revert) are `ui-button` at `data-size="sm"` instead of `btn btn-secondary`, each a fixed 32 px (`.editor-header .ui-button` in `editor.css` beats Grille's layered padding). Two `editor-sep` dividers: after the back link, before Test on lights. The title is regular weight (Grille's default). Back link, title and Test on lights are the default secondary style, folding in `Aurora-s1t7.7`.

- `forms.css` import stays. Remaining `btn` users: banners, the Dashboard controls button, ViewMenu, ControlsDrawer, ParamWidget, DesktopNote, the problems popup rows; `.text-input` and `.slider-input` too.
- `graph-editor-top-bar.mjs` now asserts ui-button, `data-size="sm"`, no `btn`, 32 px height and two dividers.

## Verification

- `tsc` and Vitest (133) pass.
- Browser checks top-bar, title-menu, narrow, back-link, drawers and control-count pass.
- Not run: edit-loop (no npm script) and any screenshot comparison.

## Lessons

- none
