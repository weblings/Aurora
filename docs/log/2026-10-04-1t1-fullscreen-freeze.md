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

## Direct-scanout / DMA-BUF lead: tested, not supported

- Research suggested mutter records direct-scanout frames for screencast
  only on DMA-BUF streams (2022 "Immediately record scanout" commit;
  gnome-46 `before_stage_painted` returns early if `!uses_dma_bufs`), and
  `input/linux/src/PipewireGrabber.cpp` offers no modifier or Buffers
  dataType (so memfd). Same code in huenicorn-fork. Sources are in the 1t1 notes.
- Test: `MUTTER_DEBUG_PAINT=disable-direct-scanout` via
  `~/.config/environment.d/`, re-login, flag confirmed in gnome-shell's
  `/proc/<pid>/environ`. Kiosk run still stuck: 1782 frames, 0 changes, 30s;
  owner saw Firefox fullscreen and flipping.
- So direct scanout alone does not explain the freeze. DMA-BUF is not ruled
  out as a factor, but nothing supports it now; do not build it on this basis.
- Env file removed after the test.

## Resume

1. Instrument `PipewireGrabber` (debug flag, no behavior change): process
   callbacks/sec, buffer type, format/modifier, `param_changed` events.
   Splits no-callbacks vs callbacks-with-stale-content vs renegotiation.
   Needs a `linux-app` rebuild.
2. Then pick a fix from the result (bead candidates: damage/framerate hints,
   renegotiate on `param_changed`, staleness watchdog).
3. 2ucb: fresh profile per phase so `window` is a real control.

3 lessons: a control phase only counts if observed; `pkill -f` matches its
own shell; SSE frames arriving does not mean capture is fresh.
