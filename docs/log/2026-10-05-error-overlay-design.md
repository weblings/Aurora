# Error overlay design pass

Id: error-overlay-design

2026-10-05. Design-only pass for Aurora-d3ec's open step 4 (the retry-path
question) and its "design sketches" section, worked out with the owner
before any code. Follow-on to
[[error-text-and-leak-beads]]'s own d3ec review. Aurora-k73j (tray feedback
on a failed Resume) stayed explicitly out of scope, same split that review
already made.

## Done

- Walked `DashboardScreen.js`'s actual clearing rules and found two real
  bugs in `topTierError` that the earlier review had only suspected:
  `_togglePause`'s success path never clears it (a failed-then-succeeded
  Resume keeps showing the old message, `DashboardScreen.js:651-652`), and
  `_onAutoDivideClick`'s success path clears the field but never calls
  `_renderTopTier()`, so the stale text can outlive the fix on screen.
- Replaced the single-winner `currentError` idea (no good answer for which
  source wins when two are true at once, e.g. daemon-unreachable and a
  stale switch error) with a list model: every currently-true source
  renders as its own row, keyed by source rather than by message text, so
  a retry that comes back reworded updates in place instead of reading as
  a new problem.
- Walked all six concurrent failure cases (mode switch, resume/pause,
  device save, auto-arrange, startup build, daemon-unreachable) against the
  open "what resolve action, if any, does an error's row need" question.
  Two wrong framings on the way: "does an on-page control already retry
  this" (missed that offering it in the overlay saves a trip anyway), then
  "which sources need Retry" (still assumed Retry is always the action).
  Landed on: the action is a property of what went wrong, not of which
  control produced it. Permission-flavored failures already have a real,
  working fix, `MacPermissionRecovery.js`'s deep link to the Screen
  Recording pane (confirmed still working through Tahoe), reused as-is
  rather than redesigned; retryable-but-not-permission failures get Retry;
  daemon-unreachable gets no button, since there's no click a user can
  take that does anything the heartbeat isn't already doing on its own.
- Picked a fixed-position overlay (corner badge + offset body) over both a
  toast and an in-page, scroll-tracked zone — NUX screens share none of
  Dashboard's layout to anchor a zone to, and a fixed widget never scrolls
  out of view in the first place, so there's nothing for a scroll-tracked
  badge to watch.
- Settled the overlay's own mechanics: two-corner drag (one horizontal
  edge, top/bottom only, to avoid needing both axes of mirroring), a
  generic row template per error (not per-category markup), newest row
  always at badge height with older ones pushed away as new ones arrive,
  and row animation deliberately deferred (ship instant show/hide first;
  the keyed-slot work to animate it later is cheap precisely because the
  source set is small and fixed, but not worth building speculatively).
- Wrote the converged design to [[error-overlay]].

## Lessons

- [components.md](../lessons/components.md): extended "One failure
  rendered by two paths needs one owner" with the within-one-field
  recurrence (`topTierError`'s own success paths) and the
  simultaneous-conditions case that single-winner precedence can't answer.
- [planning.md](../lessons/planning.md): two new entries, "A toast is the
  wrong primitive for a condition that can be true before any user action"
  and "An error's resolve action is a property of what went wrong, not of
  which control produced it."
