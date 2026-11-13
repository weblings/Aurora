# Graph editor: mock for how a shell with 2+ rows starts (decision frame and A/B storyboard)

Id: u8jx12-shell-start-mock

`Aurora-u8jx.12` (P2), follow-up to `Aurora-u8jx.5` (the shell collapses as one). Mock only; no editor or shell code changed. The owner has not yet picked; the choice is recorded in `Aurora-u8jx.5` and `docs/planning/ErrorOverlay.md:186` when made. Not committed at the time of writing.

## What was built

In `web/ui/Static_GraphEditor_Mocks_Grille` (frames under Stage 7):

- `#s7-start` (`shellstart.js`, `shellstart.css`): organised by decision. D1 capped or uncapped open shell, D2 2+ rows open or collapsed at load (plus the empty state before the first `/api/state` reply and a Dashboard-styled frame), D3 the cap value (`min(35vh, 220px)`), then the capped shell in use (focus ring on the scroll region, Tab into rows, Show less pinned outside it). Windows are drawn at true height and the shell's share is measured live.
- `#s7-sim` (`shellsim.js`): a storyboard. Dropdown of nine sequences, a "collapse survives navigation" toggle, Back and Next. Each frame is A (every row set opens at load) against B (2+ collapsed at load) after one step, with what each did, a same/differ badge, and a table of all steps. Sequences 1-9: cold load, new error, new notice, message change, countdown, rows clearing one by one, flapping, Dashboard to editor, reload. 10-14 (editor-supplied rows, scrolled region with an arrival, Retry then message change, keyboard and screen reader, Aurora stops) are not built.
- Mock-wide changes made on the owner's review: the error mark is the Grille dev.16 `circled-exclamation.svg` verbatim (the hand-copied path sat low), drawn in Grille error red; notices carry `circled-info` in the default colour; rows use Grille's inline-icon pattern so wrapped text stays out from under the icon; the dot and gap between "N errors" and "N notices" are gone; the scroll fade shows at whichever edge has more rows.

## Findings

- Measured: one row 79 px, two 166, three 218. Three rows scroll only at about 400 px wide. At 400 x 650 uncapped takes 295 px (45%), capped 269 px (41%), collapsed 37 px (6%). The cap saves little; open versus collapsed at load is what moves the space.
- Under the `Aurora-u8jx.5` rules A and B differ only at page load and across navigation or reload. After any new row or changed message they look the same, and with collapse surviving navigation (per tab) they stop differing.
- Actual code, read 2026-11-13: `shell.js` `_renderBanner` and `ErrorShell.tsx` `ShellBanner` render pairings (Dashboard), the light-test row, conditions, host errors in daemon order, then editor notes. Pairings and the light-test row sit outside the collapse and the "N problems" count. The mock folds notices into the collapse per the `Aurora-u8jx.5` scope, which is a change from today. Host errors carry a host-wide monotonic id (`Pipeline.hpp`, `dismissError`); conditions have none. The daemon's array order was not checked.
- Rejected on analysis: a new row shown alone that vanishes after a timer. It adds a state beside collapsed and open, needs per-row keys and timers in both `shell.js` and `ErrorShell.tsx`, loses a still-true error, and does not answer page load.

## Owner direction so far

Likes the scroll mock; the 220 px cap feels good; new errors should surface at the top of the scroll view. Open: cap or not, open or collapsed at load, persistence across navigation, re-open versus a dot on the collapsed bar (alternatives), ordering (notices pinned, errors newest first, conditions by first seen). Follow-up `Aurora-u8jx.13`: Errors, Notices and Problems (graph only) as tabs.

## Checks

Each frame was loaded headless (`playwright-core` in `tools/browser-check`, cached Chromium, file URL) with no console errors; measurements and sequence tables were printed and read, screenshots checked. Sequences 2, 3, 5, 6, 7, 8 replayed with the expected logs, including persistence on for sequence 8. The last small edit ("already open, the rows update") and the removal of the flash outline from the Dashboard bar were not re-screenshotted.

## Lessons

Six entries filed in `docs/lessons/planning.md`: name the decision axes first; draw at true height and measure; storyboard A against B for behaviour over time; take icons and patterns from the library dist; read the code and say where the mock differs; verify headless and strip leftovers.
