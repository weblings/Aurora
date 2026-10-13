# Aurora-wqzp.9: perf-harness proves the mover from the relay SSE

Id: wqzp9-mac-mover-proof

2026-10-13. Box: MacBook (Apple M5, macOS 27), Homebrew Python (no
tkinter), ffplay present, Firefox running. Closed the way wqzp.11 was:
the Mac launch path is sidestepped, the silent failure is made loud.

## What the wqzp.11 log supplied

- On a box without tkinter, `start_mover` already prefers ffplay, so the
  Mac never reaches the kiosk-Firefox launch (sandboxed profile,
  WebUI tabs landing in the kiosk window). The `open -n -a Firefox`
  launch from the bead was therefore not built.
- `check_mover_alive` covers a dead mover; wqzp.11 itself listed the
  live-but-hidden mover as the uncovered case.

## Fix (`tools/perf-harness/perf.py`, `stripes.html`)

- `FrameCounter` counts SSE frames whose zone colours differ from the
  previous frame; `measure` returns `changed_per_s`.
- `check_mover_visible` runs after each `moving` row with a video input
  and exits when `changed_per_s < 1`, refusing to report static as
  moving. Audio-only rows are exempt (the tone drives them).
- All three movers (ffplay, tkinter, `stripes.html`) add a +-10 level
  brightness breathing at ~0.4 Hz (slow, no flashing).

## Why the breathing

First live run aborted: 0.0 of 49 frames/s changed. The mover was on
screen and working: a standalone probe read flat zones at 0.137
(= stripe/background mean 35.5/255). A 240 px stripe period averages to
the same value in every large zone however it drifts, so drifting
stripes alone never change zone colours. The overall brightness shift is
what the zones can see (also what the wqzp.3 manual proof read, 0.30 ->
0.215).

## Verification

- Live, Mac: `perf.py --modes video --content moving --seconds 10`:
  1.4% CPU, 49.1 frames/s, 49.2 Hz, video 0.26/3.50 ms. Passes.
- The check firing on a really hidden mover was not reproduced; only the
  false positive was seen. tkinter and Firefox movers not run here.

## Left open

- Firefox-kiosk fallback on Mac is unchanged (would still hit the
  sandboxed-profile and WebUI-tab issues); the SSE check now makes its
  failure loud instead of silent.
