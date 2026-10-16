# G4c: audio.bounce re-seeds when drift re-seeds (Aurora-ra4o.13)

Id: ra4o13-g4c-bounce-reseed

Closed 2026-10-15. Third agent-path fix from the G2 review of
[[nodes-agent-ux]]. Decided with the user: anchor-jump detection, not
documentation only and not damping.

## Done

- `audio.bounce` loses its `fixedAnchorHue` param. It resets its state when
  the incoming anchor jumps farther than drift can move in one tick
  (`120 deg/s * dt + 1`, from the slider maxes 60 deg/s base x 2 centroid).
- `audio.drift` is unchanged and still resets on a `fixedAnchorHue` change.
- Node metadata (`useWhen`) and the `AudioNodes.hpp` header say to set the
  fixed hue on drift only.
- Built-in audio graph and its Config overlay no longer set the param on
  `beat`.
- Tests: bounce nodes in `AudioNodesTests` drop the param, the re-seed test
  still checks the colour snaps to the new hue, `BuiltInGraphsTests` checks
  bounce carries no `fixedAnchorHue`.
- Windows MSVC Debug: full suite 250/250, parity goldens unchanged (deliberate
  check, no golden moved).
- Lessons: 1 (architecture-process, reset trigger derived from upstream).

## Carried forward

- A saved graph that sets `fixedAnchorHue` on bounce now fails to load. None
  found in the repo.
- A re-seed landing within the jump margin of the old hue damps instead of
  snapping. Negligible, not handled.
- Mac and Linux builds (only Windows run here).
- Remaining G2-review item: Aurora-ra4o.14 (Absent-tick anchor).
