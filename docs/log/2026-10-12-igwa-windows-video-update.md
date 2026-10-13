# Aurora-igwa: Windows video update() over the tick budget

Id: igwa-windows-video-update

2026-10-12. Found by the Aurora-o13 Windows run ([[o13-dual-capture]]): video
`update()` averaged ~32 ms against a 16.67 ms budget in every mode (Linux 7.3,
Mac 4.1). Closed the same day.

## Cause (three layers)

- **Timer resolution.** DXGI `AcquireNextFrame(16)` waits ~28 ms at default
  timer resolution (measured 28.3 ms for a 16 ms wait; 16.7 ms after
  `timeBeginPeriod(1)`). The app never raised it. 32 -> ~24 ms.
- **CPU rescale every tick.** Probe on a static 3840-wide desktop: grab 16.8 ms,
  `_prepareSource` rescale 7.0 ms, rest 0.1 ms. The grabber returns the cached
  full-size frame on a wait timeout and the Orchestrator rescaled it again.
  Windows ignored `setCaptureWidthHint` (Mac uses it since Aurora-3qh).
- **The "300 ticks/5.0s" was never a rate.** `[dual-capture]` sums the
  nominal `dt`, so it always reads 5.0 s. The real rate was ~31 Hz, which
  matches ~158 light frames per 5 s.

## Fix

- `timeBeginPeriod(1)` for the process (`app/windows/src/main.cpp`, links
  `winmm`).
- `IVideoInput::frameSerial()` (default 0 = unknown). `Orchestrator` reuses the
  `_prepareSource` result while the serial is unchanged, and `setConfig` clears
  it. `WindowsGrabber` bumps it per delivered frame. Core test added.
- `WindowsGrabber::setCaptureWidthHint`: mip chain via `GenerateMips`, reads
  back the smallest level >= max(8x hint, 256) px (Mac 3qh rule). Falls back
  to full size if the textures cannot be made.

## Result (static 4K desktop, 60 Hz, devstack, flag on)

| | Before | After |
|---|---|---|
| Video `update()` avg | ~32 ms | 16.0 ms (all of it the grab wait) |
| CPU, video only | 31-43% | 2.4% |
| CPU, video + audio | 30-39% | 3.9% |
| Light frames / 5 s (video) | 158 | 280 |

Core 182/182, windows-app 87/87.

## Moving content (Aurora-wqzp.1, `tools/perf-harness`)

Same machine and build, fullscreen window redrawn every ~16 ms, 20 s windows,
wall-clock Hz. Static rows re-run with the harness for comparison. The table
is from a first, full-screen flashing pattern (since replaced as a
photosensitivity risk). A re-run with slow dark stripes matched it: video
9.7-15.5% CPU at 32 / 50 Hz, both 21.4% at 56 Hz. Cost follows frames
delivered, not contrast.

| Mode | Content | CPU | Update avg / max ms | Tick Hz | Light frames/s |
|---|---|---|---|---|---|
| video | static | 2.5% | 15.9 / 27 | 55.7 | 55.6 |
| video | moving | 8.4-15.4% (3 runs) | 3.1-8.8 / 15-26 | 32, 32, 50 | 32, 32, 46 |
| both | static | 2.4% | 15.9 / 33 (audio 0.09) | 56.2 | 111.9 |
| both | moving | 19.7-21.7% (2 runs) | 10.0-10.3 / 22-23 | 56.3-56.4 | 111-112 |
| audio | static / moving | 0.3% / 1.2% | 0.14-0.15 | 56 | 56 |

- **Moving content costs 3-6x the static CPU** (video 2.5% -> 8-15%), well under
  the old 31-43%. Not the "far below" guess for free: GPU mips plus readback
  is real work.
- **Real tick rate is ~56 Hz, not 60**, even in the best static case. The old
  "ticks/5.0s" hid this.
- **Video-only moving is erratic: 32 Hz twice, then 50 Hz**, with update avg
  only 3 ms. A 3 ms update at 32 Hz means the loop idles ~28 ms per tick, so
  something other than `update()` paces it. Not chased here (Aurora-wqzp.5 and
  .6 own tick pacing). Both-mode moving held 56 Hz.
- Audio-moving CPU (1.2% vs 0.3%) is the app process alone, cause not chased.

## Concerns left open

- **Moving content measured on Windows only**, one display, a synthetic
  stripe pattern, not real video.
- **Colour parity unchecked.** GPU box-filter mips vs the CPU INTER_AREA path
  were not compared numerically. Odd sizes floor each level, so edge pixels may
  differ slightly.
- **The 16 ms wait still paces the tick.** On a static desktop the video
  update sits at the full budget (16.0 of 16.67 ms) because the wait is the
  loop's sleep, so any extra work now breaks the budget. A configurable
  timeout or a grab thread would give headroom. `WindowsGrabber.cpp` records
  that a 0 ms wait starved on hardware.
- **Timer resolution is process-wide and power-costly.** `timeBeginPeriod(1)`
  raises wakeups on battery laptops. Acceptable for a lighting daemon, not
  measured.
- **Mac/Linux untested for the interface change.** `frameSerial()` is header
  only with a default of 0, so behaviour should be unchanged there. Grabbers
  that overwrite one buffer in place (Linux X11) cannot adopt reuse without
  their own counter.
- **Other displays.** Only one 4K 60 Hz SDR display was run. The HDR (RGBA16F)
  path shares the mip code but was not exercised. Multi-monitor selection is
  untested.
- **`[dual-capture]` stats reported nominal seconds.** Fixed in Aurora-wqzp.1:
  the window and `ticks/<s>` now use wall-clock time and print the real rate
  in Hz. Numbers in this log predate that, so its "ticks/5.0s" were nominal.
