# Aurora-i5hq: idle fullscreen X11 damage source + quiet-desktop CPU

Id: i5hq-x11-idle-damage-source

2026-10-20. Box: MediaServer (i5-7600K, GTX 1070, X11 session, HDMI-0
3840x2160, RelWithDebInfo, powersave). Validates the projection in
[[1pwk-x11-damage-ratecap]] and the staleness floor in
[[es51-x11-damage-latch]]. No Aurora code changed.

## Source of the fullscreen damage

A throwaway XDamage probe (RawRectangles on the root plus every viewable
InputOutput window, depth <= 3) over 20 s on the live session: root 122
events, all fullscreen. VS Code (`code_code`, 3770x2133) produced 120 of
them (~6/s, avg area 8.04M of 8.04M px, i.e. whole-window). Gjs, Nautilus,
the terminal and gnome-shell produced one each.

Electron/Chromium GPU-composited windows damage the whole window on any
change (caret blink, spinner), and the root then reports the full screen.
So the 1pwk "~60% of idle ticks" was the editor on this desktop, not the
NVIDIA driver and not a panel/clock. The ~378x175 screenshot diff band was
the real change. Nothing for Aurora to fix: damage skipping cannot help
under a continuously-repainting fullscreen app, and the 50 ms cap is what
bounds that case.

## Quiet-desktop number

Xephyr at 3840x2160 (`Xephyr :7 -screen 3840x2160 -ac`, truly idle, has
DAMAGE) as the clean session: `DISPLAY=:7 python3 tools/perf-harness/perf.py
--modes video --content static --seconds 30`.

| Session | Video CPU (static) | Hz |
|---|---|---|
| Real desktop, VS Code open (es51) | 31.9% | 46.4 |
| Idle Xephyr 4K | 3.4% | 1.2 |

Matches the ~3% projection. 1.2 Hz is the 1 s staleness re-grab; grabs
cost ~35 ms each (powersave, so inflated). Caveat: Xephyr is software
rendered, so this shows pipeline cost when nothing is damaged, not NVIDIA
server behavior.

## Lessons

- [[lesson-input]]: "Idle fullscreen X11 damage: probe per-window, and use
  Xephyr as the clean session" (new).
