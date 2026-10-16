# B3: decomposition parity gate for drift and bounce (Aurora-id8j.9)

Id: id8j9-b3-decomposition-parity

Closed 2026-10-16. Parity gate of the Sequence B epic ([[sequence-b-planning]]).

## Shipped

- `angle.add` in `ColorNodes.cpp`: two Angle inputs `a` and `b`, Angle output `angle`,
  wraps at 360, non-finite sum fails the node. Needed for drift's anchor (seed + integrated
  drift) and bounce's target (anchor + swing offset). Registered through `registerColorNodes`.
- `AudioParityTests.cpp`: drift and bounce rebuilt from `rollingAverage`, `math.*`,
  `integrate`, `stepOnTrigger`, `smooth.angle`, `smooth.exp`, `palette.randomAnchor`,
  `angle.add` and `color.fromHSV`, run beside `updateDrift`/`updateBounce` on the same
  scripted features.
- The scripted-features test node now emits the `audio.features` scalar ports too.

## Verification

- Three scenarios (beats, silence drift, every setting off-default), 300 to 600 ticks each.
  Per tick: anchor within 0.05 degrees, color within 1 per channel (uint8 round trip).
  Full suite green (MSVC `build-core-test-win`): 341/341 ctest.
- Parity is 60 Hz only. The compound's rolling centroid is a per-tick alpha of 0.02, so
  `rollingAverage` tau = -dt/ln(0.98), about 0.825 s, matches at one rate.
- `palette.randomAnchor` seed 1 is read back and set as the compound's `fixedAnchorHue`
  (the compound rng is unseedable).
- `integrate` initial is `base * dt` to cancel the one step it takes on tick 0, since the
  compound's first tick only seeds state.
- Known gap: an onset on tick 0 snaps the decomposed hue to the swung target, while the
  compound eases from the anchor. The scripts have no tick-0 onset.

## Lessons

- None filed.
