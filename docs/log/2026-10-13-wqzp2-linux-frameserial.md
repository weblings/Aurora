# Aurora-wqzp.2: Linux PipewireGrabber frameSerial()

Id: wqzp2-linux-frameserial

2026-10-13. Box: Framework laptop `andrew-framework-12` (i5-1334U, UHD
Graphics, Ubuntu 24.04, GNOME Wayland, 1920x1200). Not MediaServer.

## Probe (temporary timers in `Orchestrator::update`, removed)

- grab ~0.00 ms, `_prepareSource` ~7.0-7.5 ms, rest ~0.3 ms of a ~7.5 ms
  tick. The rescale of an unchanged full-size frame is the whole cost, as in
  Windows pre-igwa.

## Fix (`PipewireGrabber`)

- `SafeDoubleBuffer::serial` is bumped under the mutex at the frame swap in
  `_onStreamProcess`. Skipped/no-data frames return earlier, so they never
  count.
- `grabFrameSubsample()` copies the serial with the frame into
  `m_grabbedSerial`; `frameSerial()` returns that. Reading the live counter
  instead would let a frame land between grab and serial and pair new serial
  with old pixels (the next tick would then skip it).
- X11Grabber unchanged (XShmGetImage reuses one buffer every tick).

## Result (`tools/perf-harness`, video, 20 s windows)

| Build | Content | Video CPU | update avg/max ms |
|---|---|---|---|
| before | static | 47.1% | 7.53 / 13.95 |
| after | static | 13.7% | 1.94 / 12.64 |
| before | moving (ffplay) | 88.5% | 14.36 / 26.29 |
| after | moving (ffplay) | 60.0% | 9.14 / 25.11 |

- Static: GNOME delivers only ~10 new frames/s (damage-driven), so ~50 of 60
  ticks skip the rescale.
- Moving: ~37 new frames/s from the ffplay pattern; each still pays a full
  rescale, so CPU is bound by delivered frames. Fixing it is Aurora-wqzp.4
  (downscale while copying out of the PipeWire buffer).
- Colour parity not re-measured: reuse returns the same prepared frame the
  rescale would have produced. `both` mode: 62.7% moving, 15.3% static.
- 133/133 ctest pass. No grabber unit test (needs a live PipeWire stream);
  the Orchestrator reuse path is covered in `OrchestratorTests.cpp`.

## Harness surprises

- The kiosk-Firefox mover from `perf.py` died within ~5 s of launch on this
  box (snap Firefox, Wayland), so the first "moving" runs (46.5%) were just
  static. Same family as Aurora-wqzp.11. `pgrep` mid-run showed no kiosk;
  mean zone brightness stayed ~0.97.
- Working mover: `ffplay -fs -noborder -f lavfi -i "color=c=gray:s=960x600:r=60,format=gray,geq=lum='if(lt(mod(X/2+N,240),120),43,28)'"`
  (same dark stripes). Proof: mean zone brightness 0.97 -> 0.09. Run perf
  with `--content static` while it is up. `drawbox` has no per-frame `n`/`t`
  variables, use `geq`.
- `ffplay` itself loads the box, so absolute moving CPU is pessimistic.
