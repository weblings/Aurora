# Param-row menu on the node: mock decided, build split out

Id: e4bi14-param-row-menu-mock

`Aurora-e4bi.14`, mock only (`web/graph-editor/controls-mock.html`, Panel model b, "Param menu" switch row). Plan: [[graph-editor-cleanup]] Stage 10, follows [[e4bi8-tuning-only-design]]. Build is `Aurora-e4bi.15`.

## Decided (owner, 2026-11-17)

- Right-click on a param row opens a short param menu: Add to Tuning when off, Remove from Tuning when on. The wording replaces "Show in Tuning", which read as three things beside Show on node and the picker.
- Hit area: the row, but a number or text field keeps the browser's Copy and Paste menu so values can be copied. Today every right-click on a node, fields included, opens the node menu.
- Separate param menu, not a group in the node menu. Merged, the group sat beside Delete and "Add to Tuning…" sat above "Add to Tuning".
- Node menu item renamed Tuning controls… (picker titled the same), distinct from the param's Add to Tuning. "Controls" is the project word, "params" read as agent vocabulary.
- No check mark item (Grille has no lone checkable item, owner dislikes it), no Find in Tuning (read as Show), touch keeps the picker. Picker placement stays as built: beside the node, over it only when neither side has room (400 and 360 px).
- Mac has no key for the context menu. The node's `...` is a tab stop shown on `:focus-visible`, so its route to Tuning controls… is already keyboard-complete.

## Found

- Shift+F10 opened the mock's menu, focused its first item, then the browser menu opened on top. Windows raises the native `contextmenu` on key release, after the popup took focus, so no handler of ours sees it. The mock swallows it until the key is up (owner confirmed on Windows). `App.tsx` onKey has the same pattern and probably the same bug for the node menu, folded into `Aurora-e4bi.15`.
- Headless Chromium cannot produce the real Windows event, so the guard was checked by dispatching `contextmenu` on the focused item.

## Verification

- Headless Chromium (`tools/browser-check` helpers) at 1100, 700, 400 and 360 px: hit areas by right-click and key for each variant, both menu forms in and out of Tuning with the undo toast, menus inside the window, picker overlap measured, no page errors. `tsc` clean.
- A replace script emptied `ControlsPanelMock.tsx` mid-session. It was rebuilt from HEAD plus the logged edits and rechecked. Diff the file before relying on it.

- Lessons: Windows raises contextmenu on key release (components.md)
