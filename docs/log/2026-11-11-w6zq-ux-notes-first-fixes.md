# Graph editor UX notes: first fixes

Id: w6zq-ux-notes-first-fixes

`Aurora-w6zq.1`, `Aurora-w6zq.2`, `Aurora-w6zq.3`, `Aurora-w6zq.5`. First editor-side children of the UX notes epic `Aurora-w6zq`, ahead of stage 6.

## State

- `.1`: at the narrowest width the Dashboard controls panel sat under the React Flow credit (both z-index 5, credit later in the DOM). The panel is now z-index 6; the corners browser check hit-tests the overlap.
- `.2`: one name for one place. `ControlsDrawer` title is "Dashboard controls" (count only above zero), subtitle "Shown in this order.", empty state "None yet." Owner approved the proposed wording in the bead. The static mocks under `web/ui/Static_GraphEditor_Mocks*` keep their older wording.
- `.3`: the View menu opens over the minimap, sharing its left edge, width, border and radius (corners browser check).
- `.5`: no agent text in any hover. `tipOf`/`summaryOf` no longer fall back to `useWhen`/`purpose`; the node body title is `info.tip`; Add node rows are name + summary only (In/Out socket dots and their CSS removed). `purpose` stays in the details drawer and in search matching. Port hovers keep `port.description`.

## Verification

- `.2`: graph-editor vitest `graph.test.tsx` 38/38, now asserting the non-empty and empty states; `tsc --noEmit` clean; grep finds no other use of the old strings.
- `.1`: corners browser check extended in its commit; not rerun here.
- `.5`: vitest 132/132, `tsc --noEmit` clean; `graph-editor:add-menu` browser check passes with new assertions (no `.add-sockets`, no `purpose`/`useWhen` text in any `[title]`).
- Not run: the browser checks against `.2`, and none of them match the old strings.

## Lessons

- none
