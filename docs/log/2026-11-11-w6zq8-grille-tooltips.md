# Grille Tooltip in the graph editor

Id: w6zq8-grille-tooltips

`Aurora-w6zq.8`. Hover help on nodes, ports, params and toolbar buttons is Grille's `Tooltip`, not `title=`.

## State

- `src/Hint.tsx` wraps any element in `TooltipTrigger` + `Focusable` (several lines render as a list). Grille's trigger needs a focusable child, so plain elements go through React Aria's `Focusable`; `react-aria-components@1.22.1` is now a direct dependency, pinned to Grille's version.
- Covered: node title (tip), port names and types, problem badge, param labels, Undo, Redo, Add node, Test.
- Documented exception: Add node menu rows have no hover (a menu row cannot host a tooltip); the summary line is their help.
- Test off: the whole `.editor-split` group carries the reason tooltip with `pointer-events: none` on its buttons, because a disabled button sends no pointer events.
- New browser check `graph-editor-tooltips`; `top-bar` and `narrow` read tooltip text instead of `title`.
- No tip was rewritten with bold or lists yet; all are plain text.

## Verification

- vitest 132/132, `tsc --noEmit` clean.
- Browser checks tooltips, top-bar, narrow, add-menu, popover-toggle, drawers, context-menus, control-count pass.
- The `*-light.png` screenshots show the dark theme: `emulateMedia` does not switch the editor's theme.

## Lessons

- A browser check that hovers an element the mouse already rests on gets no pointerenter after a reload; move the mouse away first.
