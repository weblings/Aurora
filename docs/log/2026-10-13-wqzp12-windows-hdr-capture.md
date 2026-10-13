# Aurora-wqzp.12: Windows HDR desktops capture at the right colour

Id: wqzp12-windows-hdr-capture

2026-10-13. Box: i9-12900K, RTX 3080 Ti, Win11. HDR on: ASUS VG289Q1A and LG TV
(primary), SDR white 240 nits. HDR off: DELL U2415.

## Problem

Legacy `DuplicateOutput` returns BGRA8 clipped at scRGB 1.0 (80 nits). With SDR
white at 240 nits, everything above about 157/255 sRGB clipped. The FP16 branch
in `WindowsGrabber` never ran (no `DuplicateOutput1`).

## Change

- `_ensureDuplication` calls `IDXGIOutput5::DuplicateOutput1` with
  `[R16G16B16A16_FLOAT, B8G8R8A8_UNORM]`, legacy `DuplicateOutput` without
  `IDXGIOutput5`.
- SDR white scale from DisplayConfig (`GET_ADVANCED_COLOR_INFO`,
  `GET_SDR_WHITE_LEVEL`), read on duplication and every second after. Wide
  colour only (ACM on an SDR panel) keeps 1.0.
- `scRgbToSrgb8` (new, `ScRgbConversion`): white divide, clamp, sRGB curve
  (was a 2.2 power with no divide). A 64K table indexed by half-float bits.
- An alpha-0 placeholder that opens a duplication is no longer published.
- Tests: `[ScRgbConversion]` unit tests (ctest), manual "captures SDR greys at
  their sRGB value on every monitor" (draws its own grey windows).
- Manual "keeps SDR greys exact across HDR toggles and SDR white changes":
  one live grabber on an HDR-capable non-primary monitor, HDR on/off/on via
  `DisplayConfigSetDeviceInfo`, SDR white moved with the undocumented
  setter the Settings slider uses (type `0xFFFFFFEE`), state restored after.
- It caught a stale colour: a slider move sent one frame, converted before
  the 1 s white-level refresh, then none on a static desktop (grey 128 read
  162). The grabber now keeps the last FP16 readback and republishes it
  reconverted when the white level changes.

## Result

| sRGB grey | Dell (SDR) | HDR before | HDR after |
|---|---|---|---|
| 64 | 64 | 109 | 64 |
| 128 | 128 | 210 | 128 |
| 192 | 192 | 255 | 192 |

- HDR toggle test: grey 128 exact at HDR on, SDR white 240 -> 400 nits, HDR
  off (BGRA), HDR back on. No stale-output problem after toggles.
- All manual Windows tests pass. Mips parity mean diff 0.19 -> 0.72 (max 1 ->
  65 at edges): GPU mips now average linear light, the CPU reference sRGB.
- CPU, video moving, same day: legacy 18.2%, FP16 22.7-24.1% (float
  conversion 23.5-26.1%). Static unchanged (1.0%). Update 0.25-0.30 ms, 56 Hz.

## Open

- Decided: keep linear-light mip averaging on FP16, though Mac, Linux and
  Windows SDR average sRGB. Physically closer to emitted light, effect small.
- CPU cost not yet attributed (Aurora-wqzp.14) before any GPU conversion.
- perf.py does not yet record HDR state or SDR white level.
