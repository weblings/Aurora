# Aurora-wqzp.4: Linux downscale while copying out of the PipeWire buffer

Id: wqzp4-linux-decimate-on-copy

2026-10-13. Box: Framework laptop `andrew-framework-12` (i5-1334U, GNOME
Wayland, 1920x1200, DMA-BUF stream).

## Change

- `PipewireGrabber::setCaptureWidthHint()` stores the hint (atomic, read on
  the PipeWire thread). `captureDecimation(hint, width)` picks the largest
  integer k keeping the frame >= max(8x hint, 256) px; `toOwnedImage(...,
  decimation)` INTER_AREA-averages by k straight from the mapped buffer
  instead of a full-size clone. Edge remainder (< k px) is cropped.
- Tests: `captureDecimation` table, format/size of the decimated image,
  colour parity vs full clone + INTER_AREA (identical, NORM_INF == 0).

## Dead end: fractional target width

- First try resized to exactly 8x hint (1920 -> 512, ratio 3.75). Tick fell
  9.1 -> 1.1 ms but process CPU rose 64% -> 105%: timers in the callback
  showed ~29 ms/frame in `cv::resize` (memcpy of the 9 MB frame is 2.7 ms).
  Staging into a cached scratch Mat changed nothing, so not the DMA-BUF read.
- OpenCV INTER_AREA has a fast path only for exact integer ratios. The old
  Orchestrator rescale (1920 -> 64, ratio 30) hit it. Integer k fixed it.

## Result (`tools/perf-harness`, video, 20 s, ffplay+geq mover)

| Build | Video CPU | update avg/max ms |
|---|---|---|
| before (re-measured same session) | 64.8%, 62.7% | 10.8 / 9.7 avg |
| fractional target (rejected) | 104-105% | 1.1 |
| integer decimation | 50.5%, 50.2% | 1.1-1.2 |

- Remaining cost is the unavoidable CPU read of the 9 MB frame plus the k-step
  average, at ~58 delivered frames/s.
- Compositor-side scaling not pursued: mutter delivers the monitor's native
  size (the 9 MB copy confirms full-size buffers) despite the 1..4096 offer.
- Harness gotcha: `devstack.py` runs `build/linux-app/bin/Aurora`, not
  `build/bin/Aurora`; the first "after" run measured the old binary.
