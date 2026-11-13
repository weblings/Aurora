# Graph editor: mock for the uncapped shell with a one-pulse arrival spotlight

Id: u8jx14-shell-spotlight-mock

`Aurora-u8jx.14` (P2), from the `Aurora-u8jx.12` and `.13` discussion. Mock only; no editor or shell code changed. Owner picks (2026-11-13): tinted ring, 12 px gap kept, 60vh cap with the 420 px window case approved; recorded in `Aurora-u8jx.12` and `Aurora-u8jx.5`. Not committed at the time of writing.

## What was built

`#s7-spot` in `web/ui/Static_GraphEditor_Mocks_Grille` (`shellspot.js`, rules appended to `shellstart.css`):

- `LiveShell`: one live window (editor or Dashboard styled, 1470 / 650 / 400 wide, 650 or 420 high) driven by events: reload, load 1 or 6 rows, collapse, error / notice arrives, both at once, message change, countdown, clear. Row elements are cached by source + message (as a keyed React list or a keyed patch would), so a pulse in flight is not restarted by a later render and scroll position survives.
- Rules shown: notices first (pairings, light test), then conditions, then errors newest first, which is the order `shell.js` `_renderBanner` and `ErrorShell.tsx` use today (read 2026-11-13; the bead's proposed errors-first order was dropped on owner review), with the collapsed bar listing notices then errors to match; the collapsed bar is one button holding both counts (notices then errors, each with its mark) that opens every row; any arrival or changed message re-opens; no pulse on first render or on a countdown; polite live region carries the new row's text; `max-height: 60vh` safety cap (owner: the 420 px window case feels good) with the scroll fade from `#s7-start` at each edge with 8 px inner padding so the ring is not clipped.
- Over the cap: the first new row is scrolled into view; each pulse is paused (`data-wait`) until an IntersectionObserver sees the row.
- Pulse: `ss-spot`, half of the chip's `editor-ping`: box-shadow 0 to 8 px, 1375 ms, once. Ring colour in two variants, neutral (row border) and tinted (error red on error rows). Reduced motion: `ss-hold`, a 2 px ring held for 1375 ms (forced by a toggle, and by `prefers-reduced-motion`).
- Frozen frames stop the same animation at 0, 20 and 50% (negative `animation-delay`, paused) for: 1470 / 650 / 400 x Editor / Dashboard, ring colours, and two simultaneous pulses at gap 12 and 20 px.
- Storyboard: sequences 2, 3, 4, 5 and the newly built 11 (scrolled region, then arrivals) replayed on the live window.

## Findings

- Filtered counts (bead item 3) were built, then dropped on owner review: with no scroll view the filter saved about one row and added a third state, a "Show all N" control and a clear-on-arrival rule. One bar with both counts, one click to open everything.
- Two adjacent rings at 12 px gap meet at about 50% of the pulse and read as one halo, not a collision (the ring is faint there). 20 px separates them; not needed.
- Under the cap a pulse can be left unplayed when its row is scrolled out of view; it plays when the row is scrolled in, so two rows can be mid-pulse together.
- A neutral ring is the row border colour, so on dark it is faint; tinted reads clearly for errors and equals neutral on notices.
- Mock bug found and fixed while checking: a full redraw reset the region's scrollTop, and the arrival scroll targeted an older still-waiting row instead of the new one. Both are things the code bead must not repeat: keep the element, scroll to the fresh row only.

## Checks

Headless (`playwright-core`, cached Chromium, file URL, no console errors): playground flow (load, collapse, error arrives re-opens and pulses once, pulse attribute clears after the animation, countdown stays collapsed, filtered open shows errors only, notice arrival clears the filter); storyboard 2, 3, 4, 5, 11 stepped with expected open/collapsed and pulse counts; screenshots of the width matrix and spacing frames read. Not checked: reduced-motion frame by screenshot, Dashboard narrow 400 frames beyond the matrix, the real OS reduced-motion setting.

## Cost in code

`shell.js`: the `Aurora-u8jx.5` "skip the write when markup is unchanged" fix becomes a prerequisite (innerHTML every 3 s poll restarts the animation), or better a keyed patch; plus a previous-key set, `data-new` cleared on `animationend`, a live region, and above the cap an IntersectionObserver and a scrollTop adjustment (about 25 lines). `ErrorShell.tsx`: rows are keyed already; needs a previous-key set, the same attribute and live region, and a small effect for the over-cap case. Keyframes live in `ui/styles/shell.css`; the Problems chip can share them.

## Lessons

- none new: the mock bugs (demo buttons re-adding a row with an existing key so nothing pulsed, a redraw resetting scroll) are recorded under Findings and fall under the existing "verify headless" entry.
