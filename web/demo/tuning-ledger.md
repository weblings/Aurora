# Tuning Key Ledger (Phase 4)

Every Dashboard tuning key and its disposition in the demo port. A key is
either **live** (a PUT changes the visible scene) or **round-trip** (the shim
stores it and the Dashboard displays it back, with no scene effect). There
are no other outcomes — anything unlisted here is a bug.

## Live keys

| Key(s) | Effect |
|---|---|
| 11 `audio*` keys | Written in place onto the live `midpoint` settings object (`audioEffectSettingsByModel.midpoint`); drift/bounce state persists across edits, as natively. `audioFixedAnchorHue: -1` → `undefined` (unset/random per Config.hpp). |
| `transitionSmoothing` | Direct drive of `smoother.smooth()`'s lerp factor — verified the identical quantity to `Smoother::smooth`. Note: native default is 0, so a default config un-smooths the demo's old hardcoded 0.85. That visual change is parity with the app, not a regression. |
| `subsampleWidth` | Nonzero values resize the video sampling path live (`sampleVideoFrame` compares against the live width). `0` keeps the demo's 160px derive analogue. Test-pattern canvases stay at build width — acceptable: those paths have no Dashboard-driven UI once `rainbow` is disabled. |
| Mode (`activeInputName` / `activeAudioInputName`) | probeState's rule mirrored exactly: empty input + audio input → `audio`, else `video`. Drives `setSourceMode()` (extracted from the old dropdown listener). |

## Round-trip keys (stored, displayed, no scene effect)

| Key | Why no effect |
|---|---|
| `refreshRate` | Daemon tick rate; the scene runs on rAF. |
| `activeMonitorName` | No capture device in the demo. |
| `audioTargetSinkName` | No capture device in the demo. |
| `interpolation` | Native applies it in capture rescale; the demo downscales via `drawImage`. |
| per-zone `gamma` | Stored on zones and round-trips (PUT applies, GET returns); the demo scene doesn't implement output gamma — native applies it in the output stage — so the slider has no visible scene effect. |

## Deliberate scene deviations (not tuning keys)

- **Inactive zones go dark.** Natively the stream carries active zones only
  and unstreamed lights hold their last color — but on a demo page a frozen
  quadrant reads as a broken toggle, so in both the video and audio paths a
  zone with `active: false` has its lights set to black every frame while
  the Dashboard bool stays the single source of truth. If bridge parity ever
  needs demonstrating instead, delete the two darkening passes in `animate()`
  and the hold behavior falls out of the existing skip logic.
