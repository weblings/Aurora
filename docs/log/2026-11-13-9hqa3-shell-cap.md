# Error shell 60vh safety cap: fades, scroll to the new row, pulses that wait to be seen

Id: 9hqa3-shell-cap

`Aurora-9hqa.3` (P2), stage 6 follow-up 2.4 under `Aurora-9hqa`, the epic's last child. Working tree only at the time of writing; the coordinator commits and closes. Builds on [[9hqa1-shell-row-model]], [[u8jx5-shell-collapse]], [[9hqa4-shell-pairing]] and [[9hqa2-shell-spotlight]]; the approved design is [[u8jx14-shell-spotlight-mock]]; design in [[error-overlay]] (The banner, Rows).

## What was built

- Markup, both pages: `.shell-banner-inner` now holds `<div class="shell-banner-rows">` (every row) and then the toggle, outside the region so Show less is always reachable. The region is drawn even when empty (collapsed), so the markup stays one shape; `.shell-banner-rows:empty` is `display: none`. `shellRows.js` `bannerHtml` and `ErrorShell.tsx` draw it; `ErrorShell.test.tsx` parity still holds.
- `web/ui/shellPatch.js`: `applyPatch` patches two keyed lists, the region's rows and the toggle (in `.shell-banner-inner`, after the region), each with the same plan, so a poll leaves the scrolled region's `scrollTop` alone and the toggle node is still patched in place (focus kept). The children walk skips the region itself (no `data-key`).
- `web/ui/styles/shell.css`: `.shell-banner-rows` is `max-height: 60vh`, `overflow-y: auto`, `overscroll-behavior: contain`, 8 px padding with a -8 px margin (so the 8 px pulse ring is not clipped and rows sit where they did), an inset focus ring (the token rule for clipping containers). `.shell-over` plus `.shell-less` / `.shell-more` draw a 28 px mask fade at an edge that has more rows past it (the mock's value). `.shell-banner-row[data-new][data-wait]` pauses the animation.
- `web/ui/shellCap.js` (new, shared by `shell.js` and `ErrorShell.tsx`): `createShellCap({ onPulseDone })` with `render(slot)` called after every draw. It keeps the region's `shell-*` classes true on scroll, on `ResizeObserver` of the region and on window resize; sets `tabindex=0`, `role="group"` and `aria-label` only while `scrollHeight > clientHeight` and removes all three when it stops; holds every new row's pulse with `data-wait` before it reads layout; when the region is over the cap scrolls the first new row (drawn order) into view with a 28 px margin (`scrollTo`, smooth unless reduced motion) and releases each held row when an `IntersectionObserver` rooted on the region sees it whole (or filling the window, for a row taller than it); when it is not over the cap releases at once. The 2 s fallback that clears `data-new` starts when a pulse is released, not when the row arrives, so a waiting row is never cleared early. Pure parts: `firstNewKey(drawnKeys, freshKeys)` and `scrollTopFor(...)`.
- `web/ui/shell.js`: one `_cap`; `_renderBanner` calls `render` after the patch; the old whole-slot 2 s timer is gone. `ErrorShell.tsx`: a layout effect after every commit calls `render`; `onPulseDone` drops the key from `pulsing` (the old 2 s effect on `pulsing` is gone). Neither stubs a missing `ResizeObserver` or `IntersectionObserver`: the cap just skips them (and a unit-test slot double that is not a real element).
- `web/demo/vendor/webui/styles/shell.css`: re-synced (`sync-webui.py`); the manifest and descriptor sync noise reverted; `seams.test.mjs` passes. `shellCap.js` and `shell.js` are not vendored.

## Decision: which arrival scrolls

The arrival scrolls to the FIRST new row in drawn order, wherever the user had scrolled to (the mock's sequence 11), never to an older still-waiting row and never by resetting `scrollTop` on an ordinary redraw. "A row arriving off screen pulses when scrolled to" is therefore the second and later new rows of one poll (and any row that the first one's scroll leaves out of view): their `data-wait` holds, with `data-new` kept past the 2 s fallback, until the user scrolls them in. Also tried and dropped: the scroll anchoring a browser does for rows inserted above a scrolled region moves `scrollTop` by itself, so the browser check does not assert exact scroll positions for that case, only that the first new row ends in view and pulsing.

## Checks

- Unit: `shellCap.test.mjs` (first new key in drawn order, an older waiting row never chosen, none new, none drawn; `scrollTopFor` clear, above, below, taller than the window, clamp at 0), `shellRows.test.mjs` (toggle after the region, collapsed region empty), `ErrorShell.test.tsx` (parity unchanged), `shell.test.mjs`, `shellPatch.test.mjs`. No stub of layout, `IntersectionObserver` or scrolling (owner's note).
- Browser, new `shell-cap` (`npm run shell-cap`), the Dashboard and the editor on one stack, each at 400x650 and 400x420, real dev errors and real pairing requests: collapsed at load has no region concerns; 5 rows overflow, region height is at most 60vh, Show less is below it and in the window; fades at the top (bottom edge only), mid (both) and end (top only), by class, custom property and computed mask; Shift+Tab from Show less reaches the region (it comes before the buttons in the rows) and ArrowDown scrolls it; two polls leave `scrollTop`; a new error below the pairing notices arrives held, scrolls into view and starts a running ping fully in view; three new notices in one poll: the first drawn starts in view, the last stays held with `data-new` past 2.6 s, then each waiting row pulses once when scrolled to; collapsed, the region is not focusable, an arrival re-opens and scrolls to its row and pulses in view; a taller window ends the overflow and removes `tabindex` and `aria-label` (no Tab stop), a shorter one restores it; clearing the rows leaves none. A page-side `MutationObserver` logs each arrival (held or not) and each pulse start (row fully in region, ping running).
- Existing checks re-run: see the report (results below).
- Screenshots (`SHOTS`, read): at 400x650 and 400x420 on both pages the region ends in a fade with Show less below it in the secondary colour; the pairing card at the bottom edge is faded out, the border of the card above it intact. They match the mock's cap frames (28 px fade, Show less outside the scroll).

## Findings

- A hidden-until-seen pulse needs `data-wait` set before the first layout read: the cap sets it on every new row first and releases at once when nothing overflows, so a normal 1-3 row shell pulses with no delay.
- The editor's `ErrorShell.test.tsx` collapsed case asserted `not.toContain('shell-banner-row')`, which now also matches `shell-banner-rows`; it asserts the exact class instead.
- The unit-test slot double in `shell.test.mjs` answers every `querySelector` with a button stand-in, so the cap only accepts something with `getBoundingClientRect`.

## Epic close-out (`Aurora-9hqa`)

- `Aurora-9hqa.1` ([[9hqa1-shell-row-model]]): one row model (`shellRows.js`) for the Dashboard and the editor, order notices / conditions / errors newest first / notes, stable keys, and a keyed patch so focus on Retry, Dismiss and Stop test survives polls.
- `Aurora-u8jx.5` ([[u8jx5-shell-collapse]]): the whole shell collapses as one toggle with counts, a baseline on the first state reply (2+ rows start collapsed), an arrival re-opens.
- `Aurora-9hqa.4` ([[9hqa4-shell-pairing]]): pairing requests are notices inside the collapse on both pages, the editor fetches and decides them, and the baseline waits for the first pending result.
- `Aurora-9hqa.2` ([[9hqa2-shell-spotlight]]): an arriving row pulses once (tinted ring) and is announced politely on both pages; none at the baseline, on the countdown or on the toggle.
- `Aurora-9hqa.3` (this log): the 60vh cap on the rows region with fades, scroll to the first new row, pulses that wait to be seen, a region that is a tab stop only while it overflows.
- Open: bug `Aurora-bju0` (`graph-editor:failed-save` times out at its `Aurora-f8yk` step, no daemon row), not touched here. Not verified: a real OS reduced-motion setting or a real screen reader over the new region; the `role="group"` choice for the labelled scroll region is not checked against one.

## Lessons

- none new.
