# Aurora-5ipy.13.1: Pause/Stop button tooltips (closed)

Id: pause-tooltips

Closed 2026-10-04. Follow-up to Aurora-5ipy.13 (stays open); owner asked for
short copy after seeing the first pass ("Play/Pause", "Stop and Quit").

## What changed

- `core/Runtime/src/ControlDescriptorTables.cpp`: `app.pause` and `app.stop`
  (button kind) join `appControlDescriptors`; count test 21 → 23 plus
  find-checks (`ControlDescriptorTests.cpp`).
- `DashboardScreen._renderTopBar`: `applyTooltip` on both button elements
  (hover target), not the inner icons — the placement half of the tooltip
  lesson, which the key-count contract cannot cover.
- `web/demo/vendor/webui/descriptors.json`: both keys hand-added (29 total).
  `gen-descriptors.py` was NOT re-run: its regex misses `slider()` forms and
  a trial regen silently dropped 12 shipped entries (filed as Aurora-ncdd).

## Verification

- `DashboardScreen.test.mjs` tooltip block (titles land on both buttons) +
  all 10 web/ui + demo suites green.
- No cmake on PATH, so the Catch2 suite never rebuilt (stale binary
  ignored); the edited TUs compile under g++ with vendored headers and a
  registry probe reports total=23, no collisions, both keys resolve.
- Live devstack: `/api/descriptors` serves both keys with final copy;
  pause/resume round-trips; frames flowing.

## Lessons

- One new entry under build-toolchain lessons ("A codegen script's docstring
  can promise more than its regex parses" — trial regen wrote 17 entries
  over 27); fix tracked as Aurora-ncdd. Tooltip presence-vs-placement
  already has a webui-testing lessons entry ("A tooltip-key oracle proves
  presence, not placement"), so no entry for that half.
