# Aurora-u5k0: X11 decimate-on-copy (neutral on CPU, kept)

Id: u5k0-x11-decimate-on-copy

2026-10-20. Box: MediaServer (i5-7600K, GTX 1070, X11 session, HDMI-0
3840x2160, RelWithDebInfo). The bead asked to port Wayland's
[[wqzp4-linux-decimate-on-copy]] to `X11Grabber` and measure before/after
plus colour parity. Port done, measured neutral: the old path was already
memory-bound, not ratio-pathology-bound.

## Change

- `X11Grabber::setCaptureWidthHint()` stores the hint (atomic, tick thread
  reads); `grabFrameSubsample()` decimates by integer `captureDecimation()`
  via `toOwnedImage()` straight out of the XShm buffer, using the real
  `bytes_per_line` stride (the old header assumed tightly packed rows).
  Decimation 1 keeps the historic zero-copy header; member renamed
  `m_lastFullScreenFrame` -> `m_lastFrame`.
- `toOwnedImage()` generalized to 3-byte pixels for X11 24bpp visuals
  (default still 4; PipeWire callers untouched).
- Tests: 6 new `toOwnedImage` 3-channel cases (dims/format, clone,
  padded stride, decimate crop, colour parity vs full clone + INTER_AREA
  at NORM_INF == 0, bad-bpp rejection). Frame suite 14/14 green.
- No slice README change: no new toggles or entry points.

## Result (`tools/perf-harness`, video)

| Build | Static CPU / Hz / tick wall | Moving CPU / Hz |
|---|---|---|
| before, same day (15 s) | 62.8% / 53.1 / 17.5 ms | — |
| after (30 s) | 63.0% / 55.2 / 17.0 ms | 53.9% / 47.3 |
| 1.1.2 baseline ([[112-linux-verification]]) | 65.7/65.8% | — |

Width sweep on the fixed binary (fresh width 48, k=10): width 480 (k=1,
full-frame path) 86.8% — the fractional 3840->480 rescale multithreads;
width 16 (k=15) 62.3%, identical to k=10. Temporary timers (reverted):
XShmGetImage 5.6 ms wall (blocking), k=10 decimate 11.1 ms CPU,
rescale 384->48 0.14 ms. All 63% sits on the single tick thread.

Why neutral: the old 3840->48 rescale (exact 80x, already on OpenCV's
integer fast path) cost ~12 ms/tick; both shapes read all 33 MB and are
memory-bound. The integer-ratio win only shows against fractional
*near-integer* targets (the wqzp.4 3.75x case, 29 ms). Wayland's real win
was tick latency (10.8 -> 1.1 ms) from reading on the callback thread,
which X11's synchronous grab cannot replicate. Kept anyway: correct,
tested, harmless, and the hint plumbing now exists for X11.

Colour parity: unit-level, exact — decimate-direct equals full clone +
INTER_AREA bitwise (NORM_INF == 0) for 4- and 3-byte paths. Live frames
flow with distinct per-zone colours in every run.

Environment notes: the sandbox blocks AF_UNIX, so X11/devstack runs went
through escalated shells; the first perf attempt also needed proxy env
stripped for urllib. `perf record` is unusable (paranoid 4, no root),
hence the temporary timers. `cmake -S . -B build` reconfig needs
`-DCMAKE_POLICY_VERSION_MINIMUM=3.5`; the `linux-app` preset already sets
it. PortalTokenTests' 19 failures reproduce identically on the untouched
tree (sandbox blocks dbus-daemon), unrelated.

## Follow-up

Aurora-1pwk carries the real X11 CPU reduction (static-skip via
frameSerial/memcmp, lower grab rate, or another approach) with the numbers
and options above.

## Lessons

- [[lesson-processing]]: "Moving an INTER_AREA downscale earlier in the
  pipeline saves nothing once every path reads the full buffer" (new).
