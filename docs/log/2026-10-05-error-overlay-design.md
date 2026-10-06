# Error overlay design pass

Id: error-overlay-design

2026-10-05. Design-only pass for Aurora-d3ec's open step 4 (the retry-path
question) and its "design sketches" section, worked out with the owner
before any code. Follow-on to
[[error-text-and-leak-beads]]'s own d3ec review. Aurora-k73j (tray feedback
on a failed Resume) was kept out of the main WebUI design, same split that
review already made, then sketched separately once the Dashboard/overlay
model was settled (see Tray, below).

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

## Tray (Aurora-k73j)

- Sketched relabeling the failed item in place (`⚠ See Error`, same slot
  Pause/Resume already occupies) rather than inserting a new entry, so a
  menu that grows or shrinks a row never shifts the other two items and
  breaks click-by-position habits; scoped today to the one source the
  tray can actually produce (resume/pause).
- Traced the actual click-to-result sequencing across all three trays:
  the menu closes immediately on selection, before the posted
  `pauseToggleRequested` flag is even picked up by the tick thread
  (`app/mac/src/main.cpp:607-636`), so the menu that caused a failure is
  always already gone by the time the failure exists. That makes a
  force-close-to-redraw workaround moot for the common case; considered
  and rejected anyway (Mac's `cancelMenuTracking`, Windows'
  `WM_CANCELMODE`, both already used for shutdown) given the risk of
  eating a click to buy freshness Mac/Windows' pull-at-open model already
  accepts as a limitation. Linux already pushes a redraw live via
  `TrayIcon::refresh()`'s `LayoutUpdated` signal, wired today only for
  the paused toggle (`main.cpp:700-703`), directly reusable for the error
  state.
- Researched whether macOS has a menu-bar icon badge/attention API for
  ambient (no-menu-open) signaling: it doesn't. `NSStatusBarButton` is a
  plain button wrapper, and `NSDockTile.badgeLabel` doesn't apply since
  Aurora has no Dock icon (`LSUIElement`). An icon swap or hand-composited
  overlay is the only lever, cost differs sharply by platform (near-free
  on Windows reusing an existing `Shell_NotifyIconA(NIM_MODIFY, ...)`
  call, spec-shaped but real work on Linux via StatusNotifierItem's
  already-exposed-but-static `Status`/`OverlayIconName`, smallest-but-new
  on Mac and shape-only given its template-image icon). System
  notifications considered and rejected, same state-vs-event mismatch as
  the WebUI toast, plus the original k73j sketch's own stated reason for
  avoiding notification permission in the first place.
- Decided ship order: in-place relabel + the existing Launch-UI action
  first (nothing new to build beyond this doc), icon swap only if ambient
  signaling proves necessary in practice, notifications skipped.
- Added to [[error-overlay]].

## Lessons

- [components.md](../lessons/components.md): extended "One failure
  rendered by two paths needs one owner" with the within-one-field
  recurrence (`topTierError`'s own success paths) and the
  simultaneous-conditions case that single-winner precedence can't answer.
- [planning.md](../lessons/planning.md): two new entries, "A toast is the
  wrong primitive for a condition that can be true before any user action"
  and "An error's resolve action is a property of what went wrong, not of
  which control produced it."
- [architecture-process.md](../lessons/architecture-process.md): extended
  "A tray label that mirrors app state should be read when the menu
  opens, not pushed" with the error-relabel case and the finding that the
  triggering menu is always already closed by the time a result exists.
- [macos-gui.md](../lessons/macos-gui.md): new entry, "No badge/attention
  API exists for an `NSStatusItem`, and `NSDockTile.badgeLabel` doesn't
  apply to an `LSUIElement` app with no Dock icon."
