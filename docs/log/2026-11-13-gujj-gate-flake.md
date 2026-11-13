# graph-editor:gate flake: the problems chip unmounts under a late draft PUT

Id: gujj-gate-flake

`Aurora-gujj`. The gate failed about 1 in 13 full sequential runs and never alone. One captured failure: the "draft needing an unopened input" step timed out clicking the `1 problem` chip ("not stable", then "detached", 30 s). Likely cause, inferred from the trace and the code (not reproduced since): the editor's debounced draft PUT from the preceding Undo lands after the check's audio PUT; its verdict clears `reloadError`, so the chip unmounts and remounts.

Changes: the gate settles, then re-PUTs the audio draft until the chip has stayed 700 ms (up to 5 tries); `lib/stack.mjs` keeps Vite's output in a temp file and prints its last 40 lines when a check throws; the gate logs main-frame navigations.

## Verification
- Before the fix: 1 failure in about 13 sequential rounds; 5 clean rounds after it with no fix.
- After the fix: 3 solo gate passes and 5 full sequential rounds (first 8 graph-editor checks, then the gate), all clean.

## Lessons
- none
