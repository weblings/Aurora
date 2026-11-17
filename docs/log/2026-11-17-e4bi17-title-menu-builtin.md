# Browser checks: title-menu picks a built-in from the Built-in sub-menu

Id: e4bi17-title-menu-builtin

`Aurora-e4bi.17`. `graph-editor:title-menu` timed out waiting for "(Copy)" in the title after New. The check clicked the second item of New, which held a built-in until `377b9449` (`Aurora-l8ua`) moved the built-ins under a Built-in sub-menu. The second item is now that sub-menu's opener and creates no copy. The check now asserts New lists Empty, Built-in, Custom, Hidden and picks the first effect from Built-in. Check only, no product change.

## Verification
- `title-menu` passes (rerun by the coordinator).

## Lessons
- web-testing.md: "A bead that renames visible text greps tools/browser-check for the old string" (select menu items by name, not position)
