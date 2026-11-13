# Graph editor: the Test menu opens like the other bar menus, and menu items pad like the bar

Id: u8jx43-bar-menu-motion-padding

`Aurora-u8jx.4.3` (P2), items 7 and 8 of `Aurora-u8jx.4`, found testing the stage 6 build. No core, server or Grille change (Grille stays on `0.1.0-dev.13`); the fixes live in `editor.css` and `SplitTestButton.tsx`.

## Item 7: why Test slid in from the right

Not an animation. Grille's `.ui-popover` has no keyframes or transition, and computed `animation-name` and `transition` are `none` on the popover and its wrapper for every menu. The Test caret menu is the only bar menu placed `bottom end`. A popover is absolutely positioned, so its shrink-to-fit width is capped by the room to its right. React Aria first places it at the trigger's left; the items wrap at that narrow width, and each re-position (anchoring the right edge) widens it a little. Sampled per frame at 1470 px: left 1341, 1317, 1305, 1293, 1281, 1279 and width 129, 153, 165, 177, 179, 179. The other menus are left-anchored, so the cap never bites.

Fix at the cause: `SplitTestButton` passes `className="editor-test-popup"` to its `EditorPopup`, `width: max-content`. Now it is at left 1283, width 175 from the first frame and never moves (a final width of 175, not 179, because the 12 px item padding became 10, below). No shared animation was added.

## Item 8: padding

Measured with `getComputedStyle` at 1470 px:

| Element | Before | After |
|---|---|---|
| Bar buttons (Effect menu, Undo, Test main, Add node) | 0 10px (Add node 6px 10px), 32 px tall, 12 px font | unchanged |
| Menu items (title, Test, View, Add node group rows) | 6px 12px, 13 px font | 6px 10px |

This is a Grille gap: a `data-size="sm"` button pads `space-sm` / `space-lg` (6/10) but `.ui-menu-item` pads `space-sm` / `control-pad-x` (6/12), and the menu item has no size to match its small buttons. Fixed locally in one `editor.css` block, `.ui-popover .ui-menu-item { padding-inline: var(--ui-size-space-lg) }`, which covers every menu popover and their submenus (title incl. New and Open, Test, View, Add node and its group flyouts, context menus). Left alone: the 13 px menu font against the bar's 12 px, and the 4 px popup padding (it keeps the focus ring inside the clip). "Dashboard controls" is a drawer with its own body padding, not a menu with items; it was not changed.

## Checks

`graph-editor:top-bar` asserts the title menu item's side padding equals a bar button's. A per-frame motion check was not added: it would be timing-dependent. Evidence was a throwaway probe sampling each popover's box every frame and its item padding, before and after.

## Lessons

- A "slide in" with no animation CSS can be a right-anchored popover re-measuring while its content wraps. Sample the bounding box per frame. Filed: [[lesson-layout-css]], "A right-anchored popover slides in while its content wraps and re-measures".
