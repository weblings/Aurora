# Input / capture-backend lessons

Capture/grabber/platform-adapter specific gotchas. See
[`README.md`](README.md) for how entries get routed here vs. elsewhere.

---

## A non-blocking poll on an event-driven capture API can starve indefinitely instead of ever returning real data

`WindowsGrabber`'s DXGI Desktop Duplication port used
`AcquireNextFrame(0, ...)` — a non-blocking poll, planned in
`WindowsInputAnalysis.md` to reproduce `X11Grabber`'s poll-anytime semantics
(`XShmGetImage` re-reads whatever's currently on screen; DXGI's call instead
waits for the *next* compositor-produced frame). On real hardware, `0`ms
didn't just occasionally miss a frame and return `WAIT_TIMEOUT` (the assumed
failure mode) — it returned `S_OK` with an empty, all-zero placeholder frame
on every call, forever, never once catching a real one across a tight
polling loop. Every diagnostic pointed elsewhere first: an apparent
HDR-format misread, a wrong-monitor-selected theory, even a
different-Windows-session theory — all plausible, all checked, all wrong.

**Fix:** use a real, short blocking timeout (`16`ms — one 60Hz frame
interval) instead of `0`. Verified reliable across repeated runs. General
principle: a "non-blocking poll" flag on an API that's fundamentally
event/frame-driven (not state-driven, unlike a plain framebuffer read) can
have a failure mode beyond "sometimes returns nothing" — it can return a
technically-successful, garbage/placeholder result instead of ever
surfacing the real one, especially right after that interface was just
created. Don't assume a `0`-timeout/non-blocking variant of a
wait-for-an-event call is safe by default; verify it actually converges on
real data under the exact call pattern (a tight per-tick loop) it'll
actually run under, not just that it compiles and returns success once.

---

## A monitor Windows still lists as attached can be powered off, and the OS won't say so

Real hardware, two monitors: `\\.\DISPLAY2` (primary, 3840x2160) and
`\\.\DISPLAY1` (1920x1200), only the latter physically on. Both passed
`DXGI_OUTPUT_DESC::AttachedToDesktop`; DWM even continued actively
presenting real frames to the "off" one (`AccumulatedFrames`/
`LastPresentTime` both nonzero, not the empty-placeholder signature above).
Its captured content was simply, validly, all-black — indistinguishable
from a real all-black desktop by anything DXGI reports.

**Fix:** no API-level fix exists — `WindowsGrabber` selects the primary
monitor by default (same as `X11Grabber`), and there's no reliable
first-party signal for "attached but not actually displaying anything."
Logged the finding rather than coded around it: whoever configures which
monitor to capture on a multi-monitor Windows machine needs to check this
manually, the same way selecting the wrong monitor index would be a
configuration mistake on Linux too — not something to build automatic
detection for without a real, named use case.

**Follow-up, confirmed live once `Config::activeMonitorName` existed:** a
powered-off-but-connected monitor isn't inherently black — it read black
above only because nothing was positioned on it. Windows keeps compositing
real content to a monitor's desktop region even with its physical panel
dark, and dragging a window onto it made the captured colors (and the real
Hue lights) react immediately. The all-black result earlier was "nothing
was there," not "this monitor forces black" — an important distinction for
debugging: a black capture from an off monitor doesn't rule out the
pipeline working correctly.

---

## Shared-mode WASAPI loopback delivers zero callbacks, not silent ones, when nothing is actively rendering

`AudioGrabber` (miniaudio-backed WASAPI loopback, `Aurora-Input-Windows`)
built and initialized cleanly, but its first real-hardware run produced
**no data callbacks at all** across a 3-second sampling window — not empty/
silent buffers, literally zero callback invocations, failing even
`sawNonEmptyBuffer`. The system had no audio actively playing at the time.
Confirmed the cause directly rather than assumed: re-ran the same test
while concurrently triggering real playback (Windows Speech Synthesis) —
callbacks started firing within about a second of playback actually
starting (real data: 48000Hz, stereo, 9600-11520 samples per ~100ms tick,
matching the negotiated rate read back from the device), and the test
passed cleanly.

**Fix:** none needed for the default effect's actual use case (reacting to
music the user is deliberately playing implies something is already
rendering), but worth remembering as a real behavior, not a bug to chase:
shared-mode loopback capture is tied to the render engine's own periodic
buffer processing, which can go idle when nothing is actively outputting
sound — there's no guaranteed keep-alive stream of silent buffers to poll
against. Anything that needs to distinguish "definitely silent" from "no
signal at all, capture hasn't started" (a manual test, a diagnostic UI)
should treat a run of zero callbacks as informative on its own, not
retry-and-hope. If a genuine need for guaranteed periodic wake-ups ever
arises (e.g. detecting "playback just started" reliably), the known
mitigation is rendering a silent stream on the same device to keep the
engine active — not attempted here since nothing in this project's scope
needs it yet.
