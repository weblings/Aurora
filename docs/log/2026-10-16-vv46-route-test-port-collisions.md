# Route test flakes under parallel ctest (Aurora-vv46)

Id: vv46-route-test-port-collisions

Closed 2026-10-16.

## Root cause

- Route tests bind hard-coded loopback ports, and `catch_discover_tests` runs each test case
  as its own process under `ctest -j8`. Two cases sharing a port collide on bind.
- Collisions: 18228 (state PUT test, concurrent settings PUT test in `PipelineTests.cpp`,
  and `NetworkTests.cpp`), 18227 (`PipelineTests.cpp` routes test and `NetworkTests.cpp`),
  18242 (two `PipelineTests.cpp` cases). Reuse inside one case (18246) is sequential and safe.

## Fix

- Gave each colliding case its own port: 18260 (routes), 18261 (state PUT), 18262
  (concurrent settings PUT), 18263 (failed-host state PUT). Test-only change.

## Verification

- 50 consecutive `ctest -j8` runs of the full suite, 344/344 each (MSVC `build-core-test-win`).
- Rule for new route tests: grep for the port before picking one, each test case needs a
  port no other case uses.
