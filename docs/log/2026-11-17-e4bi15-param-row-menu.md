# Param-row menu built on the graph editor node

Id: e4bi15-param-row-menu

`Aurora-e4bi.15`. Built the menu decided in [[e4bi14-param-row-menu-mock]]. Right-click or Shift+F10 on a param row's label or slider opens a one-item menu, Add to Tuning or Remove from Tuning (Remove keeps the Undo toast). A number or text field keeps the browser menu, touch keeps the picker, and the node menu item and picker read Tuning controls. The native contextmenu raised on key release is swallowed for both the param menu and the node menu (`paramMenu.ts`).

## Verification
- `tsc --noEmit` and `vitest run` in web/graph-editor pass (277 tests).
- Owner checked it in the browser on the light viz stack (Vite dev server proxied to the app).

## Lessons
- none
