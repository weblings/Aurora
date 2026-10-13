# Perf harness (dev-only)

One command per OS prints, for video / audio / both and static / moving
content: process CPU (% of one core), the app's `[dual-capture]` update
avg/max and real tick rate, and light frames/s. Aurora-wqzp.1.

```sh
py tools/perf-harness/perf.py                   # Windows
python3 tools/perf-harness/perf.py              # Linux, Mac
python3 tools/perf-harness/perf.py --modes video,both --content moving --seconds 20 --json out.json
```

- Prints a `hardware:` line (CPU, logical cores, GPU, OS) above the table.
- `--json` writes `{"hardware": ..., "results": [...]}`.

Brings the devstack up (`tools/light-viz-relay/devstack.py`) with
`AURORA_DEV_DUAL_CAPTURE=1`, switches mode by `PUT /api/config`, tears down what
it started. Needs a built app (`--app PATH` to override), a graphical session,
and tkinter for `moving`.

- **CPU:** deltas over the window, not lifetime averages. Windows
  `GetProcessTimes`, Linux `/proc/<pid>/stat`, Mac `ps -o cputime` (10 ms steps).
- **Update and Hz:** the app's own 5 s `[dual-capture]` lines (wall-clock Hz).
  Windows reads the app's console buffer (`AURORA_CONSOLE=1`, see
  `docs/lessons/windows-env.md`), others read the devstack `app.log`. Lines
  from the settle period are excluded.
- **Static:** whatever the desktop shows, so keep it quiet.
- **Moving:** a fullscreen window of dark, low-contrast stripes
  drifting ~0.5 Hz per pixel, so every grab sees a new frame with no flashing
  (photosensitivity). tkinter when present, else kiosk Firefox on
  `stripes.html` (same pattern). It covers the screen for the whole run.
- **Cursor (Windows only):** wiggles the real cursor at 60 moves/s over a static desktop
  (`--content cursor`), to exercise cursor-only DXGI frames (Aurora-wqzp.8).
- **Audio:** a looping 440 Hz tone plays throughout (`--no-tone` to skip),
  otherwise audio modes emit no light frames.

Windows, Linux (Wayland and X11, both GNOME, `linux-audio`) and Mac verified
(Mac: `mac-audio`, `ps -o cputime`). Moving falls back to kiosk Firefox when
tkinter is absent (Linux, Mac with Homebrew Python); on Mac it finds
`/Applications/Firefox.app` off PATH. That Firefox fallback can launch and
zombie immediately with no error (Aurora-wqzp.11) -- check the window
actually came up before trusting a `moving` result.
