# wqzp.4 Framework re-verify: hardware-tagged before/after

Id: wqzp4-framework-rerun

2026-10-21. Box: Framework laptop `andrew-framework-12` (i5-1334U, Intel
UHD, Ubuntu GNOME Wayland, 1920x1200). The log's `wqzp.4` moving numbers
(64.8% -> 50.5%) were doubted as possibly MediaServer rows, and the
`wqzp.1` thread did once misattribute Framework specs to MediaServer, so
this re-runs both sides on this box with the hardware line `wqzp.10` added
to the harness JSON.

## Method

- Two scratch worktrees (since removed): `/tmp/wt-before` at `e1452ef`
  (pre-`wqzp.4`) and `/tmp/wt-after` at `c4406fd` (`wqzp.4`), both
  configured with the era `linux-app` preset as-is (no build type, so both
  unoptimized, matching the original runs).
- Both measured with the *current* `tools/perf-harness/perf.py` via
  `--app <worktree>/build/linux-app/bin/Aurora`, so the harness (ffplay
  mover, mid-run abort, mover-visible check from `wqzp.11`/`wqzp.9`) is
  identical and only the app binary differs. Old-tree `perf.py` predates
  those mover fixes, so driving old binaries from the new harness is the
  shape to reuse. Video only, static+moving, 30 s windows.

## Result (`/tmp/before.json`, `/tmp/after.json`)

| Case | Before | After |
|---|---|---|
| static CPU | 16.7% | 13.8% |
| moving CPU | 55.3% | 46.2% |
| moving update | 9.18ms | 1.01ms |
| static update | 1.88ms | 0.49ms |

- `hardware` objects in the two JSONs are identical (i5-1334U, 12
  logical, Raptor Lake-P UHD rev 04, same kernel, both unoptimized).
- Mover proven both runs: moving changed-zone frames/s 9.4/9.6, static
  0.0. Powersave governor both runs (~0.8 static / ~1.05 GHz moving).
- Absolutes sit a few points below the log (64.8 -> 50.5 there). Same
  variance the log itself showed (its before re-measured 64.8/62.7 vs
  `wqzp.2`-after 60.0). Delta and ~50% after-level reproduce on Framework.

## Lessons

- None filed (method note above lives here; no repo-persistent gotcha).
