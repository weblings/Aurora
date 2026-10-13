# Aurora-wqzp.3: Mac video CPU 19% vs 3qh's 5.5%

Id: wqzp3-mac-video-cpu

2026-10-12. Work done; the bead closes once Aurora-wqzp.1 (X11 run) does. Mac video mode measured ~19-22% CPU and a 4.1 ms
`update()` in the o13 and wqzp.1 runs, against 5.5% when Aurora-3qh closed
([[3qh-mac-capture-width-hint]], [[o13-dual-capture]]).

## Cause

- `subsampleWidth` is 190 on this display (3420x2214 px, MacBook Air 15").
  190 is the smallest subsample candidate (gcd of width and height is 18).
  3qh measured with 16.
- The 3qh rule asks SCK for an 8x oversample, so the stream delivered
  1520x984 BGRA frames, not the 256 px 3qh measured.
- Every delivered frame was cloned in the stream callback (6 MB), and every
  tick INTER_AREA-resized 1520 -> 190 on the CPU. `sample`: ~1500 of ~7000
  tick-thread samples in `cv::resizeAreaFast_Invoker` (~21% of a core),
  plus ~6% on `com.aurora.sck.output`.
- The width hint was applied correctly (config PUT and rebuild are fine).

## Fix (`ScreenCaptureKitGrabber.mm`)

- Stream callback keeps only `SCFrameStatusComplete` / `Started` frames
  (Idle repeats are dropped) and retains the `CVPixelBuffer` instead of
  copying it; `grabFrameSubsample()` converts it only when it is new.
- `frameSerial()` counts delivered frames, so `Orchestrator` skips the
  rescale on a repeat (as on Windows, Aurora-igwa).
- Oversample 8x -> 2x (still >= 256 px): 380 px at width 190.

## Result (Apple Silicon, devstack, `tools/perf-harness`, 20 s windows)

| Build | Content | Video CPU | Video update avg/max ms | Both CPU |
|---|---|---|---|---|
| before | static | 21.6% | 3.94 / 8.45 | 22.8% |
| before (8x) + frameSerial | static | 7.3% | 1.75 / 11.95 | 9.4% |
| before (8x) + frameSerial | moving | 24.2% | 4.98 / 10.07 | -- |
| final (2x) | static | 3.3% | 0.35 / 2.66 | 5.8% |
| final (2x) | moving | 4.3% | 0.54 / 2.88 | 6.5% |

Audio alone 4.0-4.1% either way (Aurora-wqzp.7). Tick rate ~51 Hz, not 60
(Aurora-wqzp.5). Mac app tests 84/84.

- frameSerial alone fixes only static screens: a moving screen delivers a
  new frame every tick. Moving content needed the smaller frame.
- Colour check: a static text-heavy screenshot shown fullscreen, last zone
  colours at full resolution vs 8x / 2x / 1x: every channel within 1/255
  (mean 0.5, 0.5, 0.7). SCK's GPU scaling averages well enough.
- Factor sweep on moving content: 8x 24.2%, 2x 4.4%, 1x 4.2%.

## Harness surprises

- The first "moving" run (7.1%) had a dead mover: zone output never
  changed. Proof each time was a light-SSE read (consecutive-frame changes,
  mean brightness 0.30 -> 0.215).
- From the agent's sandboxed shell, `perf.py`'s kiosk Firefox cannot open
  its temp profile ("profile missing" dialog) or exits at once. `open -n -a
  Firefox` with a profile under `~/Library/Caches` works.
- The app opens its WebUI on launch in whatever Firefox is running. If the
  kiosk mover is already up, the WebUI tabs land in it and hide the
  stripes. Launch the mover after the app. Filed as Aurora-wqzp.9.
