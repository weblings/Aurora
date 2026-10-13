# Aurora-wqzp.13: Windows capture honours display rotation

Id: wqzp13-windows-display-rotation

2026-10-13. Box: i9-12900K, RTX 3080 Ti, Win11. Monitor 1 rotated to portrait (1200x1920).

## Change

- `_ensureDuplication` reads `DXGI_OUTDUPL_DESC::Rotation` into `m_rotation`
  after `DuplicateOutput`. A rotation change raises ACCESS_LOST, which
  re-runs it.
- `_captureOnce` applies `cv::rotate` to the small downscaled readback
  (ROTATE90 = clockwise, ROTATE270 = counter-clockwise, ROTATE180 = 180).
  Direction follows Microsoft's DuplicationSample vertex tables.
- New manual test `WindowsGrabber frames match the rotated desktop orientation`
  selects each monitor and checks frame aspect against `displayResolution()`.

## Result

- Monitor 1: reported 1200x1920, frame 1200x1920 (portrait). Monitors 0 and 2
  unchanged (3840x2160). All manual Windows tests pass.

## Open

- Rotation direction (versus a 180 degree error) was not verified. Monitor 1
  captured solid black, so a screenshot could not show orientation. The aspect
  check cannot tell the two apart.
- ROTATE180 and ROTATE270 not exercised on hardware.
