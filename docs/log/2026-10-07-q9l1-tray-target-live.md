# Aurora-q9l1: tray click-time target, Linux live green (manual Win/Mac pending)

Id: q9l1-tray-target-live

2026-10-07. Implements the "Send the intended state, not a toggle" fix from
[[error-overlay]]: `PendingRunRequest` in core (click-time run/pause target,
last click wins), all three trays post `requestToggle(isPaused())`, tick
threads apply `setRunning(*target)`. Core `[Tray]` unit test and full suites
green (counts in the bead comment).

## Done

- Linux live on devstack `--input dummy`, repointed at a private slowed
  fake-bridge copy (0.6s per response, under HttpClient's 1s curl timeout,
  ~2.41s resume): 1.5s-gap double Resume ends running with the menu flipping
  to Pause. A menu sample 7ms/1507ms after the clicks still read Resume,
  proving the second click landed inside the stale-label window.
- Negative control: pre-fix binary (app/ stashed, rebuilt) with the
  identical 1.5s gap ends paused with the menu stuck on Resume. Back-to-back
  4ms clicks coalesce in the tick loop and pass even unfixed, so the gap is
  the discriminating case, not click count.
- Lessons: "Back-to-back scripted inputs coalesce in the consumer loop..."
  (probe spacing plus the sub-timeout slow-fake technique) and "A missing
  session bus in an agent shell...". Extended "Sibling repos mix CRLF and
  LF..." (stash-pop LF flip) and "A dbusmenu tray can be driven..." (pointer).

## Not done (resume pointer)

- Bead stays open for the AC's Windows and Mac manual click passes; no agent
  can open those menus.
- The live script (/tmp/q9l1_live.py) and slowed bridge (/tmp/slowbridge/)
  are scratch, not committed; the technique is what the lessons keep.
