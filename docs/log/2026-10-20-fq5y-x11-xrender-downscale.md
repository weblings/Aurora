# Aurora-fq5y: X11 XRender server-side downscale (39.7/20.4% -> 4.2/1.3%)

Id: fq5y-x11-xrender-downscale

2026-10-20. Box: MediaServer (i5-7600K, GTX 1070, X11, HDMI-0 3840x2160,
RelWithDebInfo, powersave governor throughout). Follow-up to
[[1pwk-x11-damage-ratecap]], which cut how often a grab runs but not what
one costs (5.6 ms XShmGetImage of 33 MB + 11 ms INTER_AREA decimate).

## Change

- `X11Grabber::ScaleChain`: N exact 2x halvings, each an `XRenderComposite`
  (PictOpSrc, bilinear filter, scale-2 transform) from the root picture
  (IncludeInferiors) through server-side pixmaps; only the final pixmap is
  `XShmGetImage`d. The monitor offset rides in the first transform's
  translation. Result is cloned into the cached frame.
- `serverHalvings(hint, sourceWidth)` (pure, tested, in
  `PipewireFrameBuffer.hpp`): halve while the width stays >= `max(hint*8,
  256)`, cap 4 deep. 3840 + hint 48 -> 3 halvings -> 480x270. Remaining
  integer decimation (usually 1) still goes through `toOwnedImage`.
- Fail-soft: no XRender, Render < 0.6 (transforms), or no visual format ->
  chain stays null and the old full-frame path runs unchanged. Chain
  rebuilds on monitor change or when the hint changes the halving count.
- New dep `libxrender-dev` / `libxrender1` (Building.md, CI, READMEs).
- Test: `serverHalvings` case in `PipewireTests.cpp`; frame suite 15/15.

## Measured

Standalone probe (1 grab, 3 halvings, 4K): bilinear/good/best 0.4 ms
(first run 1.9 ms warm-up), nearest/fast 0.4 ms but aliased (max diff
151). Versus 5.7 ms read + 11.9 ms INTER_AREA. Quality vs INTER_AREA to
480x270: mean 0.07, max 2 levels; after the downstream 48 px rescale
max 1. Xephyr (software XRender, no GPU): 4.5 ms vs 3.8 + 11.7 ms,
bit-exact (diff 0), so a server without accelerated XRender still wins.

`tools/perf-harness` video, 30 s, same box and governor as 1pwk:

| Content | Before (1pwk) | After |
|---|---|---|
| static | 39.7% CPU | 4.2% (0.90 GHz), tick 0.56/3.65 ms avg/max |
| moving | 20.4% | 1.3% (4.2 GHz), tick 0.88/8.57 ms |

Tick avg was 11.3 ms before. Mover proven by the harness (it aborts when
<1 changed frame/s). Rows are at different frequencies (DVFS, see
[[1pwk-x11-damage-ratecap]]); the tick time is the honest metric. Light
frames/s 59 either way.

## Not done

- The 50 ms cap and 1 s staleness floor stay: with grabs this cheap the
  cap could be relaxed, but that is a motion-smoothness call (see
  Aurora-gjcj), not part of this bead.
- The 33 MB full-frame XShm segment is still allocated at selection as the
  fallback even when the chain is active.
- Zone-colour parity was checked numerically (above) and by live frames
  carrying distinct per-zone colours, not by eye on real Hue lights.

## Lessons

- [[lesson-input]]: "Let the X server do the downscale: chained 2x XRender
  composites replace the full-frame read" (new).
