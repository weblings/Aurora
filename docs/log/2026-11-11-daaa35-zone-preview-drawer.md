# Graph editor zone preview clears a side drawer

Id: daaa35-zone-preview-drawer

`Aurora-daaa.35`. The zone preview (top-right of the canvas) sat under the fixed side drawer, hiding it while a control was slid. CSS on `body:has(.ui-drawer[data-side='right'])` now moves it left by `--ui-size-drawer-width` plus its margin; the bottom dock leaves the top edge clear. Dashboard controls already stepped aside.

## Verification

- `graph-editor:narrow` extended with 1000x600 and a preview-position assertion (clear of the side drawer, above the dock) at 700x900, 1000x600, 1470x700, 400x800: passing. Not run against the old CSS.

## Lessons

- none
