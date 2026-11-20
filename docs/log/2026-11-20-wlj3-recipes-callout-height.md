# Recipes page: shared graph height and Copy callout on the left

Id: wlj3-recipes-callout-height

`Aurora-wlj3`. On desktop each recipe got its own fitted graph height, so switching tabs resized the view, and the Copy callout sat 48px below the button where it did not match the narrow layout. Every recipe now uses the shortest fitted height, and the callout sits left of the button with the same 8px gap as narrow view.

## What shipped
- `sharedHeight` in `RecipesApp.tsx` is the minimum of `viewerHeight` across all recipes (audio-over-screen's). Phone height is unchanged.
- The Copy popover places `left` on desktop and `bottom` on phones, offset 8 in both. `Balloon` takes a `side` prop and aims its pointer vertically when on the left (`.recipes-balloon-left`).

## Verification
- Checked by the owner on the Vite recipes dev server at desktop and narrow widths.
- The built bundles in `web/demo/recipes` and `web/graph-editor/dist-recipes` were not rebuilt here.

## Lessons
- none
