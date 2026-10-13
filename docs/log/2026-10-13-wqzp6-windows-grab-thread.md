# Aurora-wqzp.6: Windows capture thread, tick headroom

Id: wqzp6-windows-grab-thread

2026-10-13. Box: i9-12900K, RTX 3080 Ti, Win11, 3840x2160 @ 60 Hz primary plus
1920x1200 and a third display. `tools/perf-harness`, 20 s windows.

## Change

- `WindowsGrabber` runs `AcquireNextFrame(50)` and the mip/readback on its own
  thread and publishes the newest frame plus a serial. `grabFrameSubsample()`
  only copies it out (never blocks), `frameSerial()` is the serial of the frame
  last handed out. `selectMonitor()` and the destructor stop and join; a fatal
  error (unexpected DXGI format) is rethrown on the next grab as before.
- The 0 ms starvation note no longer applies: nobody waits on the timeout.
- `main.cpp` opts out of timer-resolution throttling (see lesson).

## Result

| Mode | Content | Before (igwa) | After |
|---|---|---|---|
| video | static | 15.9 ms update, 2.5% CPU, 55.7 Hz | 0.10 ms, 0.9%, 55.8 Hz |
| video | moving | 3.1-8.8 ms, 8-15% CPU, 32/32/50 Hz | 0.24 ms, 17.4%, 56.0 Hz |
| both | static | 15.9 ms, 2.4%, 56.2 Hz | 0.10 ms, 1.6%, 55.6 Hz |
| both | moving | 10 ms, 20-22%, 56 Hz | 0.24 ms, 26.1%, 56.1 Hz |

- Moving CPU is higher because the thread now takes every delivered frame
  (~60/s) instead of the 32-50/s the blocked tick managed.
- **Headroom:** a temporary spin in `Orchestrator::update` of 8, 12, 16 ms kept
  video static at 56.3 Hz (update 8.06, 12.06, 16.06 ms). Before this, any
  added work stacked on the 16 ms wait.
- **Colour parity** (manual test, static desktop, 3840x2160 -> 480x270): GPU mip
  chain vs CPU `INTER_AREA`, mean |diff| B/G/R = 0.06 / 0.16 / 0.19, max 1.
- **Multi-monitor:** selecting each of 3 displays restarts capture and delivers
  frames. Once, display 2 reported 2560x1440 yet delivered 3840x2160; not
  reproduced. A TV on this box was powered on partway through the runs, so a
  mode change is the likely cause (lesson in windows-env).

## Open

- HDR path not exercised: Aurora-wqzp.12.
- Display rotation ignored: Aurora-wqzp.13.
