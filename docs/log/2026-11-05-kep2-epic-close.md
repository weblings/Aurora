# Effect picker epic closed

Id: kep2-epic-close

`Aurora-kep2`. The Dashboard's Video/Audio toggle is gone, and the effect panel replaced it.

## State

- Build record: [[kep28-effect-panel]], [[kep29-wire-row-actions]], [[kep210-cut-over]].
- Failed effects: [[kep24-failed-effect-no-fallback]], [[dh1p-failure-light]],
  [[lt66-output-link-monitor]].
- Taken out of the epic by the owner, still open: `Aurora-kep2.22` (VoiceOver live region),
  `Aurora-kep2.23` (Duplicate in the web demo), `Aurora-kep2.14` (TalkBack, optional).

## Closed without building

Owner decision, both are small gains for new host state. Reopen if either comes up in use.

- `Aurora-b6yx`: Pause can't turn off the failure light. It matters only after a failed effect.
  Picking a working effect and pausing, or quitting Aurora, turns it off. From reading the code,
  not tested. The fix needs a Failed to Paused move and a Resume that retries the build.
- `Aurora-wq6i`: preview and try on lights while Failed. It needs a failed host and a source-less
  graph together, and `Aurora-que2` already lets such a graph be applied.

## Verification

- Epic acceptance was met through the closed children, whose logs hold the checks.
- Not verified: a real bridge for `Aurora-lt66` (`Aurora-qqcn`), and a Mac or Linux compile of
  `Aurora-dh1p`, `Aurora-lt66` and later work.

- Lessons: none.
