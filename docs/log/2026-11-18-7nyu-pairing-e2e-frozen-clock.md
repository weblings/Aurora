# Pairing end-to-end test uses a frozen clock

Id: 7nyu-pairing-e2e-frozen-clock

`Aurora-7nyu`. `PairingService` marks a poll too fast only when `now - lastPoll < 1` on a whole-second clock, so the end-to-end test's two polls could straddle a second boundary and get 202 instead of 429, load or not. The test now injects a fixed clock through the existing `Clock` seam. No production change.

## Verification
- `HttpServer with an AccessGuard enforces pairing end to end for a remote caller` 20 of 20 repeats. Full `ctest -j8 -C Release` 516 of 516, coordinator re-run.
- The flake was not reproduced under load, so the boundary-straddle cause comes from the code read.

## Lessons
- none
