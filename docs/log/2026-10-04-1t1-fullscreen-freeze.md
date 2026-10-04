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
- The first run's `window` phase was not a control: the owner saw Firefox
  fullscreen in every phase. Cause unknown. The profile-reuse suspect is
  contradicted: that run was window-then-kiosk, and a later kiosk-then-window
  run had a genuinely windowed `window` phase (owner-confirmed).
- Ruled out: page throttling/occlusion, Firefox not launching, tracker bug,
  dead SSE/tap.
- Separated by the instrumentation below: neither of those.

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
- Caveat found afterwards: other reports fix the freeze with the GNOME
  extension that disables fullscreen *unredirect*, not the debug-paint flag
  we used. Not verified that the flag also prevents unredirect on GNOME 46
  Wayland, so the negative result is weaker than first written.

## Instrumentation result (AURORA_DEV_PW_TRACE=1)

- `PipewireTrace.hpp` + hooks in `PipewireGrabber` (dev-only env flag, no
  behavior change): per-second callbacks, skipped (by reason), content
  changes, buffer type, chunk flags/size; `param_changed` and format logged.
- Kiosk run, GNOME 46 Wayland, BGRx 1920x1200: during the freeze PipeWire
  keeps calling back ~25/s, every one skipped as an empty chunk
  (`size=0`, `flags=0x1` = `SPA_CHUNK_FLAG_CORRUPTED`, `SPA_DATA_MemFd`);
  0 callbacks with pixels for 30s. Before it: 30-47 good callbacks/s plus
  2-5/s corrupted-empty.
- So the compositor delivers buffers flagged corrupted and the grabber
  silently serves its last good frame. No `param_changed` after startup, no
  SPA_META_Header (seq/pts -1), no damage meta, no modifier offered.
- Not verified: why mutter can't record into our memfd buffer. No mutter
  error in the user journal. The direct-scanout flag was off for this run.
- Tests: 5 new `PipewireTrace` cases pass; 2 `PortalTokenTests` cases fail
  on the baseline too (unrelated).

## DMA-BUF experiment (AURORA_DEV_PW_DMABUF=1)

- Offer a mandatory LINEAR-modifier format first (plain format fallback),
  request DmaBuf buffers, CPU-map the dmabuf fd with
  `DMA_BUF_IOCTL_SYNC` (START/END read). Dev-only, default path unchanged.
- GNOME negotiated a modifier (`dataType=3`, chunk size 9216000, flags 0).
  Kiosk fullscreen tracked the full 30s in 2 of 2 runs (20 changes, longest
  stall 1.5s). Memfd baseline failed 4 of 4 today. The second run (kiosk,
  window) also passed its `window` phase, which the owner confirmed was
  genuinely windowed: DMA-BUF tracked in both states.
- GNOME's own recorder captured the fullscreen page and the transition
  (owner-observed), so GNOME can record the content; the fault is specific to
  the memfd stream.
- Not verified: tiled-only drivers (NVIDIA) negotiating LINEAR, X11/KDE/
  gamescope, soak.

## Research round 2

- `_onStreamProcess` copies and queues each buffer immediately; there is no
  hold-last-buffer latch (the helixml/helix#3275 failure mode). A stale frame
  means no new callbacks or identical-content callbacks.
- Mutter screencast records only on stage paint and has no minimum framerate
  (helix#3275), so a producer that stops painting fits the symptom.
- No documented client-side fix (damage or framerate hints) found.
- Ubuntu bug 2037121 is a display freeze, not screencast: not relevant.

## Resume

1. Productize: DMA-BUF-first with memfd fallback (exercise the fallback by
   forcing the modifier offer to fail); treat CORRUPTED/empty chunks as "no
   new frame" and surface staleness. Then the acceptance run (30s fullscreen).
2. Other hardware/compositors: tiled-only GPUs, KDE, gamescope, X11 grabber.
3. 2ucb: why the first run's `window` phase was fullscreen is unknown;
   the runner worked as a control later. Re-check on repeat before changing it.

5 lessons: a control phase only counts if observed; `pkill -f` matches its
own shell; SSE frames arriving does not mean capture is fresh; a change to
the pipeline under test can fail a harness before the test runs; memfd vs
LINEAR DMA-BUF under GNOME fullscreen (one machine).
