# Draft would not load is a Whole graph problem; DesktopNote dropped

Id: u68h5-draft-load-problem

`Aurora-u68h.5` (stage 6e). Two banners leave the graph editor.

- **Draft would not load** (a draft the editor believes valid that the server cannot build, the preview's `draft_invalid`) is now a `Whole graph` row in the problems popover, with the server's error text. `graph/problems.ts` `draftIssues()` turns `reloadError` into a node-less issue when the draft is not already invalid; `App.tsx` feeds it to `groupProblems`, so the chip count includes it. `graph/status.ts` no longer returns a banner for it (the old "hide while the chip has problems" special case is gone with it). The next valid PUT clears `reloadError`, so the row goes with the next edit. The header's `data-preview` text still reads `Draft would not load` (`summarize`, unchanged), which the gate check waits on.
- **DesktopNote dropped** (owner decision, no toast): `DesktopNote.tsx`, its use in `App.tsx`, the `DESKTOP_NOTE` media query (no other user) and the `aurora.graphEditor.desktopNoteDismissed` key handling are deleted. The README line and the plan's narrow-windows decision are updated. `graph-editor:narrow` never asserted the note, so it needed no change.
- **Left for `Aurora-u8jx.2`:** the new row gets the same `Add node…` action every Whole graph row has; it does not fit this problem and stays until that bead picks actions per code. User-facing copy per code is `Aurora-u8jx`.
- **Not changed:** Test is gated on `valid === false` only, so a load problem does not disable Test (as before). Other banner sources are 6a-6d; the banner component stays until 6f.

## Verification

- `npm run typecheck` clean; `npm test` 140 passed (10 files), new: `draftIssues` cases in `graph/loop.test.ts` (Whole graph row with server text, counts 1, cleared by next put, not duplicated when the draft has problems), and `graph/status.test.ts` (reload error gives rank 7, `where: 'none'`, no banner). `npm run build` clean.
- All 20 `graph-editor:*` browser checks pass (none retried). `graph-editor:gate` now opens the chip after the unopened-input draft, asserts a `Whole graph` row with text and no `.editor-banner`.

## Lessons

- none
