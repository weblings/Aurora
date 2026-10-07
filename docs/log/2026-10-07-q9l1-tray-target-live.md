# Aurora-q9l1: tray click-time target — Linux live green, Windows exercised, closed

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

- Windows manual pass (owner clicking the real tray on `devstack.py up
  --input dummy`, state tracked via a polling script on `GET /api/state`):
  repointed at a bridge started with the stock `--stall-light` flag on all
  four `conf-room-4zone` lights. That had no effect on repeat resumes --
  confirmed from the bridge's own access log, every resume after the initial
  pairing build only hits `GET/PUT .../entertainment_configuration[/<id>]`,
  never `GET .../light/<id>` -- so resumes stayed ~1-2s and no stale-label
  window opened for a second click to land in. The owner then spammed the
  menu for ~30s anyway: 19 clean real-tray pause/resume alternations, no
  stuck state, no tray/host errors. A follow-up scratch bridge patch
  (`--stall-start-seconds`, stalling the `action:"start"` PUT that every
  resume does hit) was stood up to retarget the specific race window, but no
  click landed inside it before the session wrapped.
- Owner's call: the 19-toggle spam run exercised `PendingRunRequest` on the
  real Windows tray end to end with no regression, and the Linux check
  already proved the stale-label race mechanism itself; accepted as
  sufficient and closing without reproducing that exact race live on
  Windows. Mac manual pass not attempted (same no-agent-access reason).

## Not done

- Mac manual click pass remains unverified; no follow-up bead filed.
- The live scripts and slowed-bridge copies (Linux: /tmp; Windows: this
  session's scratchpad) are scratch, not committed; the technique is what
  the lessons keep.
