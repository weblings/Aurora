# Audio drift reaches output (Aurora-7r3)

Id: 7r3-audio-drift-reaches-output

Closed 2026-10-14. Found by the parity harness (Aurora-tft). Blocked G2b
(Aurora-ra4o.5), which wraps `updateDrift`/`updateBounce` as nodes.

## Done

- **Bug:** `updateBounce` read the drift anchor only at init, so drift and its
  settings never reached output.
- **Fix:** `BounceState::offsetDegrees` accumulates onset swings. Each tick
  `targetHueDegrees = anchor + offset`. Onset direction and size are unchanged.
  Non-finite self-heal covers the new field.
- **Goldens:** all 6 audio fixtures regenerated (`AURORA_UPDATE_GOLDEN=1`).
  `silence_drift` now varies (tick 0, 300, 599 all differ). The other five
  shift because every scenario now follows the anchor. Full suite 224/224
  (WSL, `build/core-test`).

## Live check (Windows Release, real music, zone 1, 60s each)

| | Pre-fix | Fixed |
|---|---|---|
| Mean step per tick | 3.61 deg | 3.07 deg |
| Max step | 120.4 | 120.4 |
| Steps over 10 deg | 12 | 5 |
| Net hue travel | +3594 deg | +3733 deg |

- The "flickery" impression was the always-positive beat swings, present before
  the fix. Drift (6 deg/s) is invisible under ~60 deg/s of swing travel.
- Captured with `AURORA_DEV_LIGHT_TAP=1` and a UDP listener on 18244.
- Not run: a silence window on real hardware.

## Carried forward

- Header struct defaults in `AudioProcessing.hpp` (0.45 bounce, 0.22 floor)
  differ from the tuned Config defaults the app uses (0.285, 0.26).
- Swing busyness is a tuning question (`audioBounceSmoothTime` up,
  `audioDynamismFloor` down), not part of this bead.
- G2b must wrap the offset-based bounce and keep the same fixtures.
