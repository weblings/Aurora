# Graph editor: the refused-save callout stays inside the window

Id: h55g-refused-callout-narrow

`Aurora-h55g` (P2), a follow-up to stage 6d ([[u68h4-refused-saves]]), found by a 400 and 700 px capture after stage 6 closed. No core, server or Grille change (Grille stays on `0.1.0-dev.13`).

## The bug

The callout was anchored to the chip's left on one line, about 429 px wide. When the chip was less than about 430 px from the left edge the start of the message was off-screen: at 400 px the box began at x=-300, at 700 px at x=-62. 6d's mock and browser check were desktop only (1470 px).

## The fix (owner-approved direction)

- **Placement is measured, not a breakpoint.** `ProblemsChip.tsx` measures the callout's one-line width (`offsetWidth` while it is laid out on the left, kept in a ref) and the chip's left edge. It stays on the left when `chip.left - 10 (gap) - 16 (gutter) >= that width`; otherwise it goes below. The 520 to 1100 px range is covered the same way: at 900 px it stays left (box x=138), at 700 and 520 px it goes below (the chip is at x=377 and 259), at 1470 px it is where it was (x=708). It re-decides on window resize while shown.
- **Left: unchanged.** Same place, look, border, timing and ping.
- **Below: wrapped, inside the gutters.** `data-place="below"` makes the status span `position: fixed`, `left`/`right: 16px`, top 8 px under the chip, the box right-aligned with `max-width: 100%` and normal wrapping; the pointer moves to the box's top edge over the chip's centre. Same border, `role="status"`, 4.2 s, ping after 1.45 s, focus on the chip, Escape and reduced motion (none of that code changed).
- **It takes no clicks.** The below placement is `pointer-events: none`. At 400 px the box spans x 16 to 384 and y 48 to 98: it covers the strip of canvas under the bar (empty canvas at the default view) and nothing in the bar. At 520 px it also covers the Add node button's lower half, at 700 px part of the canvas right of Add node. Clicks pass through to the canvas (`elementFromPoint` there is the pane), and the title menu opened above it with its items on top. Test is off while problems exist, so its caret menu cannot open then; the problems dialog is a popover, above the callout too.
- **A first-refusal bug found on the way.** The server's verdict can arrive after the refusal, so the chip (and the callout) mounts after the refusal effect ran. The placement effect depends on the chip being mounted (`shown`), else the first refusal after a fresh load stayed on the left at x=-300. The first version of the check passed because it ran after earlier refusals; it now also refuses once after a fresh load at 400 px.
- No copy changes.

## Plan fixes (`graph-editor-cleanup`)

- Status priority rule, rule 3: it said "While problems exist, the status reads `Preview paused`". The bar has no status text (the section's intro, rank 7 "Nowhere"). Now: the chip carries the count, the Zones island's cells dim (`zones-island-stale`), Test is off with `Fix the problems before testing` (`App.tsx`), and `pickStatus` still returns rank 7 `Preview paused`, which is only the header's `data-preview` hook.
- Stage 6 scope Status line, 6b entry: "its Unsaved dot waits for 6d" is now "its unsaved dot built in 6d".
- Decisions (refused saves): "callout on the chip's left" now says it goes below the chip, wrapped, where the left has no room. `web/graph-editor/README.md` says the same.
- Checked and left: Grille `dev.12` mentions are the version 6d bumped to, a historical fact; the editor's current `dev.13` is named only in the README and the j8i6 log.

## Checks

`graph-editor:refused-save` now measures the callout at 1470, 900, 700, 520 and 400 px: the full sentence, 16 px gutters each side, below the chip (not over it, no pointer events) or left of it; at 1470 px it is left of the chip on one line. Plus the fresh-load refusal at 400 px. `SHOTS=<dir>` saves `h55g-<width>.png`.

## Lessons

- A placement that depends on an element mounted later (a chip that waits for the server's verdict) needs the mounted state in the layout effect's deps; a check that runs after earlier refusals hides it, so test the first one after a fresh load. Filed: none (specific to this component).
