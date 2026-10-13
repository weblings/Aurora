# Aurora-wqzp.8: Windows skips cursor-only DXGI frames

Id: wqzp8-windows-skip-cursor-frames

2026-10-13. Box: i9-12900K, RTX 3080 Ti, Win11, ~56 Hz tick. `tools/perf-harness`, 20 s windows.

## Change

- `WindowsGrabber::_captureOnce` releases the frame and returns when
  `AccumulatedFrames == 0` and this duplication has already published an image
  (`m_hasDesktopImage`). No mip, readback, clone or serial bump.
- The flag resets in `_releaseDuplication` and `_stopCapture`, so the first
  frame after ACCESS_LOST, a monitor switch or a restart is always captured.
- New manual test `WindowsGrabber skips cursor-only frames` drives the real
  cursor (`SetCursorPos`, 200 moves). `perf.py --content cursor` (Windows only)
  wiggles the cursor at 60 moves/s over a static desktop.

## Result

- Serial bumps per 200 cursor moves: 14 without the skip, 0 with it (two runs).
- CPU (video mode): skip disabled 0.5% static / 0.5% cursor, with the fix
  0.9% / 1.0%. Run-to-run noise: the static case is unchanged by the fix.
  No measurable CPU win, since `SetCursorPos` yields few pointer-only frames and
  the downscale is GPU-side. The gain is the Orchestrator no longer rescaling.
- Windows input tests pass. ACCESS_LOST recovery is covered by the flag reset
  but was not triggered live.

## Open

- A real mouse may emit more pointer frames than `SetCursorPos`. Not measured.
