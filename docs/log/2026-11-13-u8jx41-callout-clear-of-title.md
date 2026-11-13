# Graph editor: the refused-save callout stays clear of the title and Add node

Id: u8jx41-callout-clear-of-title

`Aurora-u8jx.4.1` (P2, items 1-3 of `Aurora-u8jx.4`), a follow-up to [[h55g-refused-callout-narrow]]. No core, server or Grille change.

## What changed

- **Room on the left is measured from the title button.** `ProblemsChip.tsx` now keeps the callout on the chip's left only when `chip.left - 10 - max(16, title.right + 10) >= its one-line width`, where `title` is `.editor-header .editor-title-menu`. At 900 px the box (x 138 to about 567) used to cover the whole title button for 4.2 s; it now drops below the chip.
- **Below the chip it keeps off Add node.** The canvas's `.editor-add-node` (top-left panel) sits right under the bar. If it overlaps the box's strip, the box starts 10 px right of it when that leaves at least 220 px (`MIN_BELOW_WIDTH`), else it drops 8 px under the button and loses its pointer (`data-detached`, the pointer would no longer reach the chip). `--refused-left` replaces the fixed 16 px left in `editor.css`.
- **Check.** `graph-editor:refused-save` asserts at 1470, 900, 700, 520 and 400 px, with bounding boxes, that the callout does not intersect the title button or Add node, and that a left placement keeps a 10 px gap from the title. `SHOTS=<dir>` saves `u8jx41-<width>.png`.

## Item 3: the fresh-load step fails without the h55g dependency

First attempt: with `shown` removed from the placement effect's deps, the old step still passed. It waited for the chip before choosing Save, so the chip was already mounted when the refusal came: it never exercised the late mount. The step now holds the draft loop's PUT (the second one, `page.route`) for 2.5 s. Save's own PUT answers at once, so the refusal shows with no chip, and the chip mounts 2.5 s later under a callout that is already up (the check asserts the chip is absent when Save is chosen and the callout is still up when it appears).

With `[callout, placeCallout, place.side]` (no `shown`) the step failed:

```
AssertionError [ERR_ASSERTION]: fresh 400: below the chip

'left' !== 'below'
    at .../checks/graph-editor-refused-save.mjs:213:12
```

A probe showed the callout at `data-refused=left`, x=-300, as in h55g. With the dependency restored (`[callout, shown, placeCallout, place.side]`, byte-identical to before, and `git diff ProblemsChip.tsx` shows no line about `shown`) the check passes.

## Checks

- `graph-editor:refused-save` passes at 1470 (left, x 708), 900 (below, x 455 to 884, y 48), 700 (below, x 255), 520 (below, x 117, 2 lines) and 400 px (below, x 117 to 384, 2 lines). In every case the box clears the title button and Add node. Screenshots were read: the callout never covers the title, Add node or the bottom corner controls (View, Dashboard controls), and the text is whole. At 520 and 400 px Add node sits left of the box (it starts 10 px right of it); the detached branch (under Add node, no pointer) is not reached at these widths.
- Graph editor `npm test` (184), `npm run typecheck` and `npm run build` pass.

## Lessons

None.
