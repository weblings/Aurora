# Test temp dirs unique per process

Id: ruig-temp-dir-per-process

`Aurora-ruig`. Parallel `ctest -j8` runs are separate processes, and the nine test files that each define a `ScopedTempDir`, plus the pairing `tempStore`, mapped a name to one fixed path, so two tests could `remove_all` a directory another still held (the floor-settings test failed once in three runs on Windows). `core/tests/TempDirSuffix.hpp` adds the process id to every such path. Test-only change.

## Verification
- `Per-output floor settings persist, clamp and default (Aurora-4zr.11)` 20 of 20 repeats. Full `ctest -j8 -C Release` 516 of 516, coordinator re-run.
- The flake was not reproduced before the fix, so the cause rests on the code read.

## Lessons
- none
