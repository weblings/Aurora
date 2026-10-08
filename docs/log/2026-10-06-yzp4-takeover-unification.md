# Aurora-yzp4: takeover unified to heading-only "Aurora has stopped" (closed)

Id: yzp4-takeover-unification

2026-10-06. Owner decision from review: the shell takeover shows only
`Aurora has stopped` in every case (confirmed Stop, unexpected loss,
Dashboard, NUX) -- no reconnect paragraph, no Retry/Try-again buttons --
and the stopped state keeps polling so a relaunch clears it with no click.
[[error-overlay]]'s Daemon-unreachable section updated to the single
variant. `node web/ui/shell.test.mjs` run and green; bead closed.

## Done

- **shell.js**: `_showTakeover` renders one heading-only overlay for both
  kinds; `notifyStopConfirmed()` arms the beat instead of stopping it;
  `checkNow()` probes in every state; `_handleReachable()` recovers from
  `stopped` through `onRecovered`; `_manualRetry()` and both button
  wirings deleted.
- **shell.test.mjs**: the "terminal until manual retry" case rewritten to
  keeps-polling plus self-clear with `onRecovered(['dashboard'])`; copy
  asserts moved to the single heading with no-`<button>`/no-`<p>` guards.
- **ErrorOverlay.md**: the two-variant bullets replaced by the single
  variant (beat owns recovery in both cases).

## Findings

- **Drift enshrined by tests.** The Retry/Try-again buttons were an
  implementation addition the design never contained (design: dead end, no
  button), and the suite asserting "terminal until the manual retry" made
  the drift read as decided. Lesson filed (planning.md).
- **CSS assumed the contract.** forms.css's `h2:last-child` zero-margin +
  centering was written for the heading-only dead end; bare buttons (no
  `.overlay-actions` wrapper, where button top-margin lives) broke spacing
  silently. Lesson filed (layout-css.md).
- **No JS runtime in the original authoring session.** nodejs.org fetch
  timed out there; no repo-shipped installer. Suite authored but unrun --
  the same gap ewyz logged. Run here (Node available): `node
  web/ui/shell.test.mjs` -> `shell checks passed.` (CI's web.yml still
  skips web/ui tests, so this stays manual.)

## Remaining

- None. `bd` not in this session's PATH either; `.beads/issues.jsonl`
  closed by direct edit, matching the ewyz precedent.
