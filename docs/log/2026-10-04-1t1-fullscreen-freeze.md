# Fullscreen capture freeze: repro tooling, live repro, DMA-BUF fix

Aurora-1t1 paused (open) after rollout phase 3 of 3: fix is default and
acceptance met on this machine; huenicorn-fork scope and closeout pending. Closed: Aurora-d0hl,
Aurora-evyk. Open: Aurora-2ucb, Aurora-mvq1 (other hardware, phase 4).

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
- Tests: 5 new `PipewireTrace` cases pass. The 2 `PortalTokenTests` cases
  first logged here as baseline failures are not failures: they are
  `[isolated]` (one process per case) and pass via ctest or alone.

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

## Rollout plan and phases 1-2

- Plan (owner-approved): phases 1-3 in 1t1 (safe fallback; live proof;
  flip default to an opt-out kill switch), phase 4 (other GPUs and
  compositors) split to Aurora-mvq1, not blocking 1.0.3.
- Phase 1 code, still behind `AURORA_DEV_PW_DMABUF`: `PipewireDmabuf.hpp`
  (pure: `frameFitsBuffer`, `DmabufReadFallback`, `StaleFrameWatch`, 6 test
  cases); dmabufs mapped once in `add_buffer`/`remove_buffer`;
  `DMA_BUF_IOCTL_SYNC` checked and retried on EINTR/EAGAIN; 3 failed reads
  in a row -> loop event -> `pw_stream_update_params` without the modifier
  offer, and the DmaBuf-only Buffers param replaced with MemFd|MemPtr;
  `AURORA_DEV_PW_DMABUF_FAIL=1` fails every map. Default path: same format
  offer, plus a one-shot `[pw] capture stalled` warning after 3s of
  pixel-less buffers (log only, `isHealthy()` untouched).
- Fallback run (DMABUF + FAIL, window then kiosk): log shows modifier
  negotiated, 3 map failures, renegotiation, `modifier=none`, then memfd
  only. Window PASS (20 changes); kiosk stuck 30s as memfd always is, with
  the stall warning firing on `chunkFlags=0x1` and "recovered" after.
- Acceptance run (DMABUF, window then kiosk): both PASS (20 changes,
  longest stall 1.5s), DMA-BUF throughout, no read failures or stalls.
- CPU (pidstat, app, 30x1s, windowed, fresh stack each): memfd 79% of a
  core, DMA-BUF 68% (n=1 each).
- Owner confirmed every `window` phase was windowed and every `kiosk` phase
  fullscreen.
- Not covered: GNOME accepting the modifier then failing allocation (stream
  error; needs a reconnect, left out).

## Phase 3: DMA-BUF by default

- `AURORA_DEV_PW_DMABUF` removed. `dmabufEnabledFrom(AURORA_PW_DMABUF)`:
  on unless `"0"` (kill switch, memfd from the start). `input/linux/README.md`
  documents buffer order, fallback, kill switch, dev env vars. +1 test case;
  full ctest 118/118.
- Default build, no `AURORA_*` env, window then kiosk: both PASS (20 changes,
  longest stall 1.5s); log shows the LINEAR offer and DmaBuf buffers.
  1t1's acceptance criterion met on this machine.
- `AURORA_PW_DMABUF=0` + trace: no DMA-BUF offer, `modifier=none`, memfd
  only; window PASS, kiosk stuck 30s (memfd freeze) with stall warning and
  recovery. Kill switch verified.
- huenicorn-fork not mirrored: it is curated per upstream MR (h45), so the
  fix there is a new MR, not a copy. Scope decision with the owner.

## Resume

1. huenicorn-fork: owner decides between an h45 child bead (separate MR)
   and porting under 1t1. Then close 1t1.
2. Aurora-mvq1: tiled-only GPUs, AMD, KDE, wlroots, gamescope, soak.
   Gamescope's direct node now also gets the DMA-BUF offer, untested.
3. 2ucb: why the first run's `window` phase was fullscreen is unknown;
   the runner worked as a control in every run since.

8 lessons: a control phase only counts if observed; `pkill -f` matches its
own shell; SSE frames arriving does not mean capture is fresh; a change to
the pipeline under test can fail a harness before the test runs; memfd vs
LINEAR DMA-BUF under GNOME fullscreen (one machine); falling back from
DMA-BUF mid-stream is a param update; a test binary run directly is not
the same run as ctest; a fork kept for upstream MRs is not a mirror target.
The fullscreen-freeze entry's workaround now applies only when the stream
is on memfd.
