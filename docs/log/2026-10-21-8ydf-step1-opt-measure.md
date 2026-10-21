# 8ydf step 1 measured: rate cap at RelWithDebInfo on Framework

Id: 8ydf-step1-opt-measure

2026-10-21. Box: Framework laptop `andrew-framework-12` (i5-1334U, Intel
UHD, Ubuntu GNOME Wayland, 1920x1200). Closes the open item in
[[8ydf-wayland-rate-cap-review]] (gate never bound there: delivery sat at
16-17/s under `-O0`): this run measures step 1 with visible motion at
`RelWithDebInfo`.

## Method

- Scratch build `/tmp/opt-step1` (since removed) at HEAD `b5220f0`,
  preset flags + `AURORA_INPUT_LINUX_ENABLE_X11=OFF`. Main
  `build/linux-app` cannot reconfigure on this box: `aa96f81` made
  Xdamage REQUIRED and `libxdamage-dev` is not installed (same gap as in
  the review log; no sudo here). X11 off is fine on this Wayland box.
- Same current `tools/perf-harness/perf.py` via `--app`, video
  static+moving, 30 s windows. `PipewireCopyGate` cases green (7/7
  Pipewire+Pipeline subset).

## Result (`/tmp/step1-opt.json`, hardware-tagged `RelWithDebInfo`)

| Case | wqzp.4 unopt | step 1 opt |
|---|---|---|
| static CPU | 13.8% | 17.1% |
| moving CPU | 46.2% | 20.2% |
| moving update | 1.01ms | 0.51ms |
| static update | 0.49ms | 0.39ms |

- Gate provably bound: PipeWire delivered ~58/s against the 20/s cap,
  lights still track motion (`changed/s` 9.0 moving, 0.0 static), zero
  `[pw] capture stalled` warnings, quiet screen settles (hold-timer path).
- Static is noise-flat (13.8 -> 17.1, governor/freq comparable); the win
  is all motion copies, as designed. Moving fell 2.3x combined
  (build type + cap; not split out — the combined number is the decision
  input either way).

## Verdict

- Step 1 keeps its place: cheap, no new deps, motion cost roughly halved
  again over the unoptimized post-`wqzp.4` level.
- Step 2 (GPU downscale) stays deferred: ~20% of one core on motion and
  ~17% static remain, mostly tick overhead rather than copies, so the
  prize no longer covers EGL context, fencing, and hybrid-GPU/NVIDIA
  risk. Revisit only if a 4K Wayland box or a high-motion regression
  reopens it. `Aurora-8ydf` left open for that decision, not the code.

## Lessons

- None filed (X11-off scratch-build gap already recorded in the review
  log; `--app`-against-worktree method already recorded in
  [[wqzp4-framework-rerun]]).
