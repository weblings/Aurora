# Aurora-d2r3: Windows SDR capture dropped every frame

Id: d2r3-windows-sdr-alpha-guard

2026-10-13. Windows 11, packaged 1.1.1 build.

## Symptom

- Audio worked, video mode showed `state: running`, no errors, no log lines, and
  no light output.

## Cause

- Aurora-wqzp.12 added a first-frame guard in `WindowsGrabber::_captureOnce` that
  dropped any frame whose mean alpha was 0, aimed at the all-black alpha-0
  `DuplicateOutput1` placeholder.
- It ran on SDR BGRA frames too. This desktop reports alpha 0 on real SDR frames,
  so `m_hasDesktopImage` never became true and nothing was ever published.

## Change

- The guard now drops a frame only when every channel is zero
  (`cv::countNonZero(reshape(1)) == 0`). The HDR placeholder is still dropped.
- Confirmed live by the user: video returned with the rebuilt `Aurora.exe`.

## Audit of the other perf-pass gates

- Linux `PipewireGrabber` (wqzp.2, .4): serial bumps on every copied frame, no
  content or alpha test, decimation only shrinks. No similar risk.
- Mac `ScreenCaptureKitGrabber` (wqzp.3): gate is `SCFrameStatus` Complete/Started
  only, not pixel content, and was verified end to end. No similar risk.
- Windows cursor-only skip (wqzp.8): needs `m_hasDesktopImage`, which resets on
  every re-duplication, so it cannot starve the first frame.

## Open

- A genuinely all-black first frame (alpha 0) is still held back until the screen
  changes. Harmless, the lights stay dark either way.
- No automated test covers an SDR alpha-0 frame.
