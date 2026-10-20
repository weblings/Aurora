# Aurora-1pwk: X11 damage skip + 20 fps grab cap (63% -> 40/20%)

Id: 1pwk-x11-damage-ratecap

2026-10-20. Box: MediaServer (i5-7600K, GTX 1070, X11 session, HDMI-0
3840x2160, RelWithDebInfo, powersave governor throughout -- see the DVFS
note). Follow-up to [[u5k0-x11-decimate-on-copy]], which left X11 video at
~63% of one core: the 11 ms full-buffer decimate could not shrink, so this
bead cuts how often it runs.

## Change

- `X11Grabber` subscribes to root-window `XDamage` (RawRectangles) and
  re-serves the cached frame when no damage touched the monitor, with a
  `frameSerial()` the capture/rescale nodes already consume (reuse path
  covered in `VideoNodesTests`/`GraphRunnerVideoTests`). New `libXdamage`
  dep (`CMakeLists`, README apt line, `docs/Building.md`, `linux.yml` CI).
  Fail-soft: no Damage extension means every grab is full (old behavior).
- Busy-screen throttle: at most one full grab per 50 ms (20 fps capture,
  `kMinGrabIntervalMs`, one constant to tune). Damage is only a wake-up
  hint -- a grab always reads the live screen, so a capped tick delays a
  refresh by at most one interval. Lights still send every tick (repeats
  between grabs).
- Pure, tested half in new `X11Damage.hpp`: damage-rect/monitor
  intersection + the grab-vs-reuse decision (5 cases, 20 assertions).
  Frame suite still 14/14; full input suite 50/69 with only the 19
  pre-existing sandbox-dbus portal failures.

## Result (`tools/perf-harness`, video, same box/governor as the baselines)

| Build | Static CPU / Hz / tick wall | Moving CPU / Hz |
|---|---|---|
| before ([[u5k0-x11-decimate-on-copy]]) | 62.8-63.0% / ~55 / 17 ms | 53.9% / 47.3 |
| damage skip only | 48.2% / 49.5 / 13.4 ms | 49.7% / 46.4 |
| damage + 50 ms cap | 39.7% / 44.4 / 11.3 ms | 20.4% / 52.9 / 7.1 ms |

Moving mover proven (changed 15.1 light frames/s; the harness aborts
below 1). Frequency-independent work metric: 55 grabs/s -> ~14 static /
~20 moving, a 3-4x reduction in full-buffer reads.

## Diagnosis notes

- Damage alone disappointed (63 -> 48%) because this box's root reports
  FULLSCREEN damage ~60% of ticks even idling (rect probe, reverted):
  avgArea exactly 3840x2160 while screenshots a second apart differed in
  one ~378x175 band. No compositor runs here (`_NET_WM_CM_S0` unset), so
  damage granularity is coarse at best; intersection still stands for
  multi-monitor setups but bought nothing on this single-monitor box.
- Static then measured *worse* than moving per grab (25 ms vs 10 ms, and
  drifting 18 -> 27 ms within one run). Not a bug: intel_pstate/powersave
  parks the light-load capped run near 1.7 GHz while heavy runs sit near
  3.8 GHz, and /proc CPU time bills wall-clock ticks, not cycles. Grab
  rate is the honest metric under DVFS; every run here was
  powersave-unpinned, so the headlines still compare fairly.
- Static tick rate fell 55 -> 44 Hz on powersave: slow (~37 ms wall)
  grabs each eat two 60 Hz slots. Lights-imperceptible; at pinned-high
  frequency the same cap projects to ~23% at 60 Hz (estimate, not
  measured -- pinning needs root).
- Not validated: a truly quiet desktop (~3% expected -- mechanism proven
  by construction plus 40%-skip windows, but this desktop never idles).

## Lessons

- [[lesson-debugging-method]]: "CPU% comparisons need matched CPU
  frequency -- DVFS inflates light-load runs" (new).
