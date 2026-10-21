# Aurora-es51: X11 damage latch + 1 s staleness grab

Id: es51-x11-damage-latch

2026-10-20. Box: MediaServer (i5-7600K, GTX 1070, X11 session, HDMI-0
3840x2160, RelWithDebInfo, powersave). Found reviewing
[[1pwk-x11-damage-ratecap]].

## Bug

`_pollDamage()` drains damage events and clears the server region every
tick. Damage seen on a tick the 50 ms cap blocked was discarded, and the
decision reused undamaged frames forever. So a change burst that ended
within 50 ms of a grab (alt-tab to a static window, pausing a video) never
reached the lights until unrelated damage arrived. The 1pwk comment said
a dropped damage event "only delays a refresh by one interval". That
assumed more damage would always follow. 1pwk's runs masked it because
this box reports fullscreen root damage on ~60% of idle ticks.

## Change

- New pure `X11GrabGate` in `X11Damage.hpp`: damage latches until
  `markGrabbed()`, and `reset()` on monitor switch replaces `m_hasFrame`.
  `X11Grabber` holds one, and `m_lastGrabAt` is gone.
- `shouldGrabFrame` takes `maxStaleMs`, so an undamaged frame is re-grabbed
  every `kMaxStaleMs = 1000` (~1.7% of a core at 4K). It is the only refresh
  when a driver under-reports root damage. NVIDIA fullscreen flipping
  without a compositor is the known suspect (validation: Aurora-ii11).
- Tests: decision case updated for staleness, plus 2 new gate cases. One
  replays the dropped-damage sequence (damage on a capped tick, then quiet
  ticks, must still grab at the interval), the other covers reset.
  `linux-app` ctest 149/149.

## Result (`tools/perf-harness`, video, 30 s)

| Build | Static CPU / Hz | Moving CPU / Hz |
|---|---|---|
| 1pwk ([[1pwk-x11-damage-ratecap]]) | 39.7% / 44.4 | 20.4% / 52.9 |
| es51 | 31.9% / 46.4 | 19.4% / 47.7 |

No regression, which is expected: the latch adds at most one grab per
dropped burst, and staleness at most 1/s. The static drop is desktop or
DVFS noise, not this change.

## Follow-ups filed

Aurora-ii11 (fullscreen GL/video damage), Aurora-i5hq (quiet-desktop
number + idle fullscreen damage source), Aurora-gjcj (20 fps on real Hue),
Aurora-0pcq (harness records governor/frequency), Aurora-y6i6
(multi-monitor intersection).

## Lessons

- [[lesson-input]]: "A rate cap over drained damage events must latch
  pending damage" (new).
