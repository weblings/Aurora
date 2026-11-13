# Error shell collapses as one: baseline, snapshot, one toggle

Id: u8jx5-shell-collapse

`Aurora-u8jx.5` (P2), stage 6 follow-up 2.2 under `Aurora-9hqa`. Working tree only at the time of writing; the coordinator commits and closes. Builds on [[9hqa1-shell-row-model]]; design in [[error-overlay]] (The banner, Rows) and [[u8jx14-shell-spotlight-mock]].

## What was built

- `web/ui/shellRows.js`: the collapse rules, shared by both pages. State is a snapshot of the covered row keys (or `null`, open). `collapsibleKeys`, `isCollapsed(rows, snapshot)` (set equality on keys), `reconcileSnapshot` (kept while it matches, else `null`), `baselineSnapshot` (2+ rows: the keys, else `null`), `layoutRows(rows, snapshot)` (pairing requests, then the toggle alone, or every row and the toggle), `collapsedLabel(notices, errors)`. The `summary` and `less` kinds are replaced by one `toggle` row (id `shell-banner-toggle`, `aria-expanded`, `data-action="toggle"`).
- Covered rows: the light test (a notice), conditions, host errors and the page's own notes (errors). Pairing requests stay above the shell and outside it until `Aurora-9hqa.4`; `layoutRows` pulls them first.
- Marks: `web/ui/icons/circled-exclamation.svg` and `circled-info.svg` (Grille's `circledExclamationIcon` and `circledInfoIcon` paths), drawn as `.shell-mark` CSS-mask spans in `styles/shell.css` like `.warn-glyph`. Error rows, the permission and local-network rows (via `markErrors`) and the bar's error count use the red mark (new token `--aurora-text-error: #ff6b6b`, Grille's value); the light-test row and the notice count use the default colour. "Show less" is `--aurora-text-secondary`.
- `shell.js`: `_collapsed` and `_hasReplied`; the first reachable reply takes the baseline, `_showTakeover` resets both so recovery takes it again; each draw reconciles the snapshot; nothing is drawn before the first reply; `_act('toggle')` stores the keys on screen or clears the snapshot.
- `shellPatch.js`: a row flagged `inPlace` (the toggle) is rewritten where it stands on a changed signature, so it is the same DOM node across a toggle and keeps focus. New rows insert before the toggle, so it is never moved.
- Editor: `useHostState` returns `hasReplied` (false until the first reply and again while the takeover is up); `ErrorShell` seeds the snapshot when it turns true, reconciles it each render, draws nothing without it. The `useState(false)` and the rowCount reset effect are gone. `ShellBanner` takes `snapshot` and `onSnapshotChange`. The Problems chip is unchanged.
- Demo vendor: both icons added to `MANIFEST.json`, `sync-webui.py` re-run (`shell.css` and `tokens.css` copies updated); `seams.test.mjs` passes. The `sourceCommit` and `descriptors.json` noise was reverted.

## Deviation to confirm

A snapshot the rows no longer match is dropped at once, not kept. The criterion reads "collapsed only while the current keys equal it"; kept literally, a collapsed pair {A, B} that re-opens on C would collapse again by itself when C clears. Dropping it means a shell the user saw re-open stays open until they collapse it again. The unit tests assert this (`reconcileSnapshot`).

## Checks

- Unit: `shellRows.test.mjs` (baseline, equality, new key, changed message, countdown, reset, labels, marks, pairings outside), `shell.test.mjs` (baseline, arrival, changed message, countdown, clear, lone collapse, recovery), `ErrorShell.test.tsx` (markup parity for the new states, baseline render, nothing before the first reply). The suite has no DOM, so toggling and recovery in the React tree are browser-checked only.
- Browser: `dashboard-shell` and `graph-editor:error-shell` rewritten for the rules (load with 2 collapsed and with 1 open, lone collapse, arrival, changed message, a Once test's countdown over 5 s of ticks, recovery re-baselining by aborting `/api/state` so the daemon keeps its rows, mark colours, no overflow at 400 wide, focus on the toggle across polls and toggles on the Dashboard). `top-bar` and `failed-save` asserted "no button in the shell"; they now look inside `.shell-banner-row`, since the toggle is a button.

## Findings

- A recovery check by `devstack restart` would clear the dev errors with the daemon, so there would be nothing to re-baseline; aborting the page's `/api/state` keeps the rows and tests the same path.
- `graph-editor:failed-save` times out at its Aurora-f8yk step (a Save and apply that cannot run never produces a daemon error, `/api/state` errors empty); the shell is empty because there is no row to draw. Not shown to be caused by this change; unverified at HEAD.

## Lessons

- A check that asserts "no buttons in the shell" breaks when a toggle joins the slot: scope to `.shell-banner-row`.
