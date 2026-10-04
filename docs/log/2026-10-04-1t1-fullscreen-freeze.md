# Fullscreen capture freeze: repro tooling, live repro, DMA-BUF lead

Aurora-1t1 paused (open). Closed: Aurora-d0hl, Aurora-evyk. Open: Aurora-2ucb.

## Built

- `tools/light-viz-relay/pattern.html` (d0hl): full-screen color cycle
  (`?interval`, `?colors`, `?kiosk`), frame counter, 50ms clock,
  click/`f` fullscreen. Owner-checked in Firefox.
- `validate.py color --track` (evyk): fails if no zone color moves more than
  `--tolerance` for `--max-stall` seconds; reports the longest stall.
  `check.py` 15/15, including stall math and live-relay pass/fail runs.
- `fullscreen_repro.py` (2ucb): devstack up if needed, Firefox on
  `pattern.html` in `window` then `--kiosk` phase, `--track` per phase,
  tears down only what it started.

## Verified (Ubuntu GNOME 46 Wayland, live `linux` input)

- Kiosk Firefox reproduces the freeze: ~60 SSE frames/s for 30s, 0 color
  changes, zones stuck on red 0.98/0.02/0.02 while the page flipped on screen.
- The `window` phase was not a control: the owner saw Firefox fullscreen in
  every phase. Cause unconfirmed (suspect: profile reused from kiosk).
- Ruled out: page throttling/occlusion, Firefox not launching, tracker bug,
  dead SSE/tap.
- Still unseparated: no PipeWire callbacks vs stale buffers.

## Unverified lead (research only)

- Mutter records direct-scanout frames for screencast only on DMA-BUF
  streams (2022 "Immediately record scanout" commit; gnome-46
  `before_stage_painted` returns early if `!uses_dma_bufs`).
- `input/linux/src/PipewireGrabber.cpp` offers no modifier and no Buffers
  dataType, so it gets memfd. Same code in huenicorn-fork.
- Fits outside reports: GNOME recorder and OBS (DMA-BUF) don't freeze;
  RustDesk #16313, mutter #3074/#3903, OBS #5070 do. Sources are in the 1t1 notes.

## Resume

1. Confirm: `MUTTER_DEBUG_PAINT=disable-direct-scanout` in
   `~/.config/environment.d/`, re-login,
   `fullscreen_repro.py --phases kiosk`. A pass confirms direct scanout.
2. Fix: negotiate DMA-BUF (LINEAR modifier, CPU map with
   `DMA_BUF_IOCTL_SYNC`), keep memfd fallback; cf. hyperion.ng PR #2033.
3. 2ucb: fresh profile per phase so `window` is a real control.

3 lessons: a control phase only counts if observed; `pkill -f` matches its
own shell; SSE frames arriving does not mean capture is fresh.
