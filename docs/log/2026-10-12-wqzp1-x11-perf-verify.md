# Aurora-wqzp.1: Linux X11 perf-harness run

Id: wqzp1-x11-perf-verify

2026-10-12. Closes Aurora-wqzp.1 -- the last of the three platforms (Windows,
Linux Wayland, Mac already in earlier comments/logs) is now covered.

## Hardware

Same box as the Wayland run (hostname `MediaServer`), session type X11 this
time: Intel Core i5-7600K @ 3.8GHz (Kaby Lake, 2017, 4C/4T), GeForce GTX
1070, 16 GB RAM, Ubuntu 22.04.5, kernel 6.8. This is the oldest machine in
the fleet -- its CPU% isn't directly comparable to the Mac (Apple Silicon)
or Windows numbers logged elsewhere, and none of those recorded a CPU model
either. Filed Aurora-wqzp.10 to have `perf.py` print/record hardware info so
future runs are comparable without hand-typed notes.

## Result (`tools/perf-harness/perf.py`, 20 s windows, kiosk-Firefox mover
since no tkinter here)

| mode  | content | CPU   | frames/s | Hz   | video avg/max ms | audio avg/max ms |
|---|---|---|---|---|---|---|
| video | static  | 67.7% | 57.8 | 57.8 | 17.30 / 23.38 | 0.00 / 0.00 |
| audio | static  |  6.2% | 46.9 | 59.7 |  0.00 / 0.00  | 0.94 / 4.10 |
| both  | static  | 68.2% | 103.4 | 56.6 | 17.47 / 23.07 | 0.19 / 0.32 |
| video | moving  | 66.7% | 57.1 | 57.4 | 17.43 / 33.95 | 0.00 / 0.01 |
| audio | moving  |  6.2% | 46.9 | 59.7 |  0.00 / 0.00  | 0.93 / 1.80 |
| both  | moving  | 67.7% | 103.3 | 56.6 | 17.48 / 23.08 | 0.19 / 0.34 |

moving ~= static, as on the Wayland run: expected without Aurora-wqzp.2's
`frameSerial()` reuse, since Linux rescales full-size every tick regardless
of content.

X11 CPU (~67-68% video) reads notably higher than this same box's Wayland
run (~51-53%, see Aurora-wqzp.1 comments) for the same workload -- a
same-hardware signal, not confounded by machine age. Not chased further
here; worth its own bead if it matters (X11 vs Wayland capture path cost).

## Harness surprise: the mover lies about itself

`perf.py`'s kiosk-Firefox mover (used when tkinter is absent, as here)
launched via `subprocess.Popen` and zombied immediately on 3 of 5 attempts
in this session, with no error surfaced -- `start_firefox_mover()` never
checks `poll()`. A run in that state silently measures the static desktop
while labeled "moving," and nothing in the printed table or `--json` output
indicates it. Direct shell launches of the identical command were reliable;
no conclusive root cause found (suspected snap-firefox startup race). Filed
Aurora-wqzp.11. Worked around here with a manual retry loop that confirms
(via `ps`) more than one live Firefox process -- main + at least one
content/crashreporter child, not just the launcher -- before trusting the
run; the isolated re-check of `video/moving` alone (67.7%, 17.25/19.55 ms)
matched the full run closely enough to trust it too.

This is the same failure family as Aurora-wqzp.9 (Mac's kiosk-Firefox mover
unreliable for a different reason -- sandboxed profile, WebUI tabs stealing
the kiosk window) -- Linux's variant gets its own bead since the symptom and
likely cause differ.
