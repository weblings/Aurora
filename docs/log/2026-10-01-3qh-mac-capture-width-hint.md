# Aurora-3qh: Mac video mode resized full-Retina frames every tick

Id: 3qh-mac-capture-width-hint

Closed `Aurora-3qh` (P1, mac, 1.0.4). Found during the Aurora-ta5 UI
check (see [[ta5-param-schema]]): after switching the Dashboard to Video,
the lights switched but the mode toggle stayed on Audio.

## Cause

ScreenCaptureKit was configured at full pixel size (e.g. 3420x2214 BGRA);
`Orchestrator::_prepareSource` INTER_AREA-resized that to `subsampleWidth`
(16) on the CPU every tick. `sample` put 2349/2360 tick-thread samples in
`cv::resizeArea_`; the process sat at ~105% CPU and the tick never slept,
holding `PipelineHost`'s mutex, so `/api/monitors`/`/api/zones` waited
2-30s and `_switchMode`'s re-render (after `_loadAll`) lagged. The
starvation mechanism is `Aurora-cgr` (open, linked); this was a new,
60Hz-reachable trigger for it.

## Fix

- `IVideoInput::setCaptureWidthHint(unsigned)` -- default no-op, so
  Linux/Windows grabbers and test fakes are unchanged.
- `Orchestrator::init` calls it with `subsampleWidth` (after deriving it).
- `ScreenCaptureKitGrabber`: `makeStreamConfiguration` sizes the stream to
  an 8x oversample of the hint, >= 256px, <= full pixels, even dimensions,
  aspect kept; `setCaptureWidthHint` applies it to the live stream via
  `updateConfiguration` (bounded 5s, keeps previous size on failure), and
  rebuilds pick it up. `displayResolution()` still reports full pixels.

## Verification

- Core 93/93, parity fixtures unchanged; Mac app 62/62.
- Live (fake light stack, real `mac` input, 60Hz): CPU ~105% -> 5.5%;
  `/api/monitors`/`/api/zones` 2-30s -> < 1ms; tick thread ~95% in
  `sleep_until`, resize ~1.5% of samples; ~50 real-screen frames/s on the
  light tap. Owner confirmed the mode toggle updates and the viz follows
  the screen.

## Not done

- Linux/Windows still CPU-resize full frames (no GPU-scale hook used);
  the general never-yield hardening stays `Aurora-cgr`.
- Lesson: "ScreenCaptureKit delivers whatever size you configure"
  (`input`).
