# Aurora-ijus: shell error-copy audit — daemon leak, duplicate row, dead callback, closed

Id: ijus-shell-copy-fixes

2026-10-07. A plain copy audit of the shell error banner and its feeder
screens ([[error-overlay]]), requested independent of any open bead. Found
and fixed three copy issues and one real bug in `web/ui/TuningFields.js`,
`web/ui/screens/DashboardScreen.js`, and `web/ui/shell.js`.

## Found

- `TuningFields.js`'s slider-ranges message said "...from the daemon,"
  against the project's own "say Aurora, never daemon" rule
  ([[error-overlay]]).
- `TuningFields.js` kept its own "Saved, but couldn't apply it live:
  ‹reason›" inline copy for a saved-not-applied reload error — a fourth
  instance of the duplicate-inline-copy pattern Aurora-98pr/m0fy were
  supposed to have swept, missed because it isn't a `DashboardScreen.js`
  method (see lesson addendum below).
- The collapsed banner summary ("N problems ▾") dropped the ⚠ icon every
  expanded row, and the design doc's own mockup, both carry.
- Fixing the duplicate copy surfaced a real latent bug: `TuningFields`'s
  constructor destructured an `onUnreachable` callback but never assigned
  it to `this.onUnreachable`, so it was always a no-op — every network
  failure while saving tuning fields rendered "Couldn't reach the daemon."
  directly, bypassing the shell takeover entirely, even though
  `DashboardScreen` passed a working callback.

## Done

- Reworded to "Couldn't load slider ranges."
- Removed the duplicate copy; added an `onReloadError` constructor param to
  `TuningFields`, wired from `DashboardScreen` to `app.checkNow()`, same
  pattern every other Dashboard control already used.
- Fixed the dead `onUnreachable`/new `onReloadError` by actually storing
  both on `this` in the constructor.
- Collapsed summary now reads "⚠ N problems ▾".
- `web/demo/vendor/webui/TuningFields.js` left unchanged on purpose — it's
  a deliberately diverged fork with no shell banner to defer to
  ([[error-overlay]] Accepted gaps, decision 7), so its own inline
  saved-not-applied copy is correct as is.
- 2 lessons in [components.md](../lessons/components.md): new entry on a
  constructor callback destructured but never assigned (silent no-op, no
  error raised), and an addendum to the existing "grep every action path"
  entry noting this fourth, cross-file instance.
- Verified: `node web/ui/shell.test.mjs`, `TuningFields.test.mjs`,
  `screens/DashboardScreen.test.mjs`, `messages.test.mjs` all green.

Bead filed and closed in the same session (`bd create ... --status closed`
then `bd close --reason` to attach the close reason).
