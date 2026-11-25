# Aurora-1juz: X11 pink flashes with the GNOME magnifier, held as one-grab glitches (closed)

Id: 1juz-x11-pink-flashes

2026-11-23 to 2026-11-24. Box: MediaServer (4 cores, NVIDIA 560.35, GNOME on an X11 session, 4K LG TV on HDMI-0, VLC and Jellyfin as sources, Aurora 1.2.x). `Aurora-1juz` (closed, P2). Branch `fix/X11RandrFlashes`.

Report: the lights flashed pink now and then, and sometimes dipped to black. First guesses (Hue link, PipeWire, fullscreen VLC, the 1.1.3 stale refresh, the post-1.1.3 RandR rebuild and link monitor) were all wrong or unproven; the measurements below settled it.

## Method
- Output: `AURORA_DEV_LIGHT_TAP=1` sends one UDP JSON line of zone colors per frame ([[lesson-output]]); a 20-line Python listener on :18244 wrote every frame with a timestamp. Output ran 60 fps, no gaps over 100 ms in 190 MB of frames.
- Truth: `ffmpeg -f x11grab -framerate 20 -vf scale=96:54 -pix_fmt rgb24` of the root, mean color per frame, matched to output flashes within 0.3 s. A grab through the plain root read never showed pink, over 50+ minutes of Aurora flashing.
- Inside the path: env-gated trace in `X11Grabber` (one line per real grab: why, via, mean color) plus a dump of the pink frame as PPM. Both are removed (see Cleanup).

## Findings
- Pink: only with the GNOME screen magnifier on (2x, full-screen). Every flash was exactly one capture sample (3 output frames at 60 fps, the grab runs at 20 fps), all six zones about 0.5 bright, the same colors each time, a steady gray screen on both sides.
- The grab itself was pink: `via=chain` (the 1.1.3 XRender halving chain from the root picture, `IncludeInferiors`) returned meanBGR (87,40,125) between normal (25,24,24) grabs. The dumped frame is the Ubuntu wallpaper at 2x with no windows, panned slightly differently in each sample (the magnifier follows the mouse). So the chain intermittently reads the magnifier's zoomed view of the bare desktop layer, not the composited screen.
- Trace with zoom on, chain path: 22 of 1173 grabs flagged pink (about 2%), 44 pink grabs over the later run, every run exactly one grab long, 21 of 22 `why=damage` (not the stale-refresh path; root damage fires nearly every tick here, lesson i5hq). Consecutive normal grabs never differed by more than 1.
- A/B with the chain off (plain `XShmGetImage`), zoom on: 0 of 2700 grabs over 156 s, nothing seen by the owner. Cost: about 42% of one core at 4K, so dropping the chain is not an option.
- Black dips: seen with zoom off, a different cause or a different symptom of the same fault. One all-zero sample (6 zones exactly 0.0, about 0.2 either side, no fade) was caught in a 10 minute run. One black dip matched a real fade to black in the film (screen mean 67 to 5 in 50 ms, back up over 200 ms), so some dips are legitimate. The rest are not classified: `flag=black` never fired in the later runs.
- A standalone C program grabbing through the same chain beside a plain `XGetImage` (2 min at 30 ms, 75 s at 1 s) reproduced nothing, so the fault needs Aurora's own grab pattern or timing.

## Research
No source covers this bug and none documents a fix; the mechanism is a hypothesis. Related: `XGetImage` on the root can return stale pixels under a compositor drawing to the Composite Overlay Window (freedesktop xorg list 2016-08, libXcomposite man page); GNOME magnifier history of wrong overlap and damage rendering (GNOME bugs 642240, 666612); mutter and NVIDIA capture returning empty or grey frames (mutter #2004, #3134). The fq5y chain was verified for speed on a GTX 1070 and for exactness on software Xephyr only.

## Fix
`X11GrabGlitchFilter` (`input/linux/include/Aurora/Input/Linux/X11GrabGlitchFilter.hpp`, pure, 5 tests, ctest 211/211). In `X11Grabber::grabFrameSubsample` a candidate grab whose mean color moves more than 20 (per channel, 0-255) from the last published frame is held: the previous frame is re-served and the frame serial is not bumped. It is published when the next grab lands within 8 of the held one (a real cut, one grab late, about 50 ms) or after 2 holds in a row (strobing content cannot freeze the lights). The filter resets on a monitor switch and is skipped on the zero-copy no-hint path, which has no owned previous frame.

Live check, chain path, zoom on, 266 s: 5271 grabs, 2 pink, both held, no pink and no black in the light output (tap).

## Cleanup
The trace (`AURORA_DEV_X11_TRACE`, one line per grab plus `pink_N.ppm` dumps) and the A/B switch (`AURORA_DEV_X11_NO_CHAIN`) were removed once the cause was known: about 60 lines of ad hoc code in the grab path, easy to rebuild from the method above. Commit `312b3b44` on the branch holds them if they are needed again.

## Open
- Zoom-off black dips are not classified, and the filter's effect on a real one-grab black glitch is untested live (it would hold it).
- The 266 s soak saw only 2 glitches (the earlier run saw 22); a longer soak is worth doing before the next release.
- The chain still reads the magnifier layer; the filter hides it. Reading the composited output (the XComposite overlay window, or the GNOME screen-cast over PipeWire on X11) is the cause-level fix if glitches ever outlast 2 grabs. Filed as follow-up `Aurora-c87q`.
- The installed `~/.local/bin/Aurora` predates the fix; `cmake --install` was not run.

## Lessons
- New entry in [[lesson-input]]: the X11 XRender chain can return the compositor's bare layer for one grab; hold one-grab jumps, do not drop the chain.
- New entry in [[lesson-debugging-method]]: for a flash too short to see, record the output beside an independent capture of the truth, then trace inside the path and dump the bad frame.
