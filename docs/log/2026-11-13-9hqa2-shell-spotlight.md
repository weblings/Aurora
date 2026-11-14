# Error shell arrival spotlight: one pulse and a polite announcement

Id: 9hqa2-shell-spotlight

`Aurora-9hqa.2` (P2), stage 6 follow-up 2.3 under `Aurora-9hqa`, run after 2.5 ([[9hqa4-shell-pairing]]), so pairing rows are in the pulse and the announcement (the owner's later 2026-11-13 note supersedes pre-start note 1). Working tree only at the time of writing; the coordinator commits and closes. Builds on [[9hqa1-shell-row-model]] and [[u8jx5-shell-collapse]]; the approved pulse is [[u8jx14-shell-spotlight-mock]]; design in [[error-overlay]] (The banner, Rows). The 60vh cap, fades, scroll-to-new and visibility-started pulses stay with `Aurora-9hqa.3`.

## What was built

- `web/ui/shellRows.js` (pure, shared): `arrivedKeys(rows, known)` (keys not in the previous render's key set; nothing when `known` is null, i.e. before the baseline), `rowSpeech(row, ctx)`, `arrivalAnnouncement(rows, arrived, ctx)`; `bannerRows` takes `fresh` keys and flags `isNew`. `isNew` is state: it is not in a row's html or patch signature.
- `web/ui/shell.js`: `_knownKeys` (every key the last render held, folded or not) is set at the baseline (`_maybeBaseline`) and reset by the takeover. `_renderBanner` works out `fresh` before the collapse snapshot is reconciled, so the new key re-opens the shell and pulses in the same render, and rows that were already there (including ones the collapse hid) do not pulse. `_announce` writes one polite message into `#shell-announcer` (empty first, 50 ms later the text, cleared after 10 s); parts raised inside the delay (one poll can render twice) go out as one. A 2 s fallback timer clears `data-new` if `animationend` never arrives. The slot has one delegated `animationend` handler.
- `web/ui/shellPatch.js`: a node built for a row with `isNew` carries `data-new`; a kept node is untouched, so its pulse runs on; a same-key replace builds a fresh node without it (a changed message is a new key, so it is an insert).
- `web/ui/index.html`: `#shell-announcer` (`role="status" aria-live="polite" aria-atomic`, class `visually-hidden`) beside `#shell-banner-slot`, outside it, present from load. The NUX screens are routes of the same page, so they have it too; `shell.js` also tolerates its absence (the unit-test doubles).
- `web/ui/styles/shell.css`: `shell-ping` and `shell-ping-hold` keyframes with a `--shell-ping-tint` custom property (default text colour); `.shell-banner-row[data-new]` runs `shell-ping` 1375 ms once, `:has(.shell-mark-error)` sets the tint to `--aurora-text-error`; under reduced motion it runs `shell-ping-hold` (a 2 px ring for the same time, then cleared). `.visually-hidden` moved here from `editor.css` (the editor imports `shell.css`, so its `Announcer` still has it).
- `web/graph-editor/src/editor.css`: the chip uses `shell-ping` (2 iterations, dashed border, its own reduced-motion rule, all unchanged); `editor-ping` and `.visually-hidden` are gone.
- `ErrorShell.tsx`: render-phase `known`, `pulsing` and `spoken` state next to the collapse snapshot (same pattern as `seeded`), so the re-open and the pulse land in one commit; rows take `data-new` and clear on their own `animationend` (target must be the row); a 2 s fallback; a new `onAnnounce` prop, which `App.tsx` gives `useAnnouncer`'s `announce` (no second region). `ShellBanner` takes optional `pulsing` and `onPulseEnd`.

## Announcement words

One announcement per render: the sentences of the arrived rows in drawn order, joined with a space.

- Error: `errorSentence` (for example `Couldn't start: <reason>`); a Mac permission or audio row says the first sentence it draws.
- Condition: its message; the Local Network row says its two sentences.
- Light test: `An agent is testing an effect on the lights.` Once, when its key arrives; never the countdown or the button.
- Pairing: `Pair a device with Aurora? <device name>.` The name is what the approver checks first; the code, source and access stay on screen (reading the code aloud would also leak it to anyone in earshot, and it is meant to be compared on the device). With no name, the question alone.
- Editor-only note (draft refusal, cannot-open, failed save): its text.

## No double announcement

- The editor's toast is its own live region. Checked which rows also raise a toast: none of the shell rows do. The notes (`draftShellNote`, `openFailedNote`, `failedSaveNote`) are rows only (`graph-editor:failed-save` already asserts no toast); `testFailureToast` (refused start) and the lost-heartbeat end are toasts and not rows; the other-session light-test row is not announced elsewhere (`testOutcome`/`quietEndToast` speak test endings, not a row arriving). So every row kind goes through the shell announcement once, and the browser check asserts the toast's status region stays empty for an error, a request and the 429 note.
- Within one page, a repeat is prevented by the keys: an unchanged poll is not an arrival, and the countdown is not in a key.

## Parity

`data-new` is state, not markup. The Dashboard html and sig never contain it; the editor draws it only for keys in `pulsing`. `ErrorShell.test.tsx` holds: with no `pulsing` the two pages' markup is still equal for every case; with every row key in `pulsing` the editor's markup equals the Dashboard's once ` data-new=""` is removed, it is on every drawn row and never on the toggle.

## Checks

- Unit: `shellRows.test.mjs` (arrivals: baseline null, same rows, Set, arrival, changed message, countdown, toggle, pairing; `isNew` not in html or sig; the words per kind, joined in drawn order, no code), `shell.test.mjs` (baseline, unchanged poll, arrival, collapsed re-open with only the new row fresh, changed message, light test and countdown, two arrivals as one announcement, request at load vs arriving, recovery), `ErrorShell.test.tsx` (parity with and without `data-new`, only the named row, no pulse on the first render).
- Browser (`dashboard-shell`, `graph-editor:error-shell`): a page-side `MutationObserver` (installed with `addInitScript`) logs every `data-new` add and end with the computed animation name, tint and shadow, and every text the live region gets. Asserts: a request pending at load pulses nothing and says nothing (and the live region exists, `status`/`polite`, outside the slot); a dev error pulses exactly once, on that row only, `animation-name` `shell-ping`, tint `#ff6b6b`, `data-new` cleared after 1.2 to 1.9 s, announced once and not again on later polls; a changed message pulses and is announced; a real pairing request (`lib/pairing.mjs`) pulses with the default tint and says `Pair a device with Aurora? <name>.`; collapsed, an arrival re-opens with exactly one pulse and the rows already there never pulse; a Once light test pulses and is announced once and its countdown (5 s) neither; takeover recovery pulses and says nothing; reduced motion runs `shell-ping-hold` with a 2 px shadow and clears. Editor: the toast's status region stays empty, the 429 note is announced once. `graph-editor:refused-save` still sees the chip ping (`data-pinging`).
- Screenshots (ring mid-pulse, animation frozen at 300 ms of 1375): an error row (red ring) and a notice row (grey-white ring) on both pages, read.

## Findings

- Playwright's reduced-motion media emulation changes the computed animation to `shell-ping-hold`; the check asserts the name and a 2 px spread, not a screenshot of the held ring.
- The pairing rows are tall (about 150 px), so five rows already fill an 800 px window; that is `Aurora-9hqa.3`'s cap, not this bead.
- A test race fixed while writing the editor check: the Stop of the tab's own test announces `Reverted` just after the click, so a check that waits for "one more announcement" read it as the note's; it now waits for the note's own text.

## Lessons

- none new.
