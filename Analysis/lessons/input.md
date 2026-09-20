# Input / capture-backend lessons

Capture/grabber/platform-adapter specific gotchas. See
[`README.md`](README.md) for how entries get routed here vs. elsewhere.

---

## A non-blocking poll on an event-driven capture API can starve indefinitely instead of ever returning real data
Tags: input, dxgi, capture, polling
Applies-when: polling an event-driven capture API with a zero timeout

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
Tags: input, windows, monitor, dxgi
Applies-when: debugging black capture on multi-monitor Windows

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
Tags: input, audio, wasapi, windows
Applies-when: testing loopback audio capture with nothing playing

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

---

## A mislabeled pixel format can be harmless upstream and become a live bug the moment downstream code starts trusting the label
Tags: input, pixel-format, x11, pipewire
Applies-when: changing code from ignoring to trusting a format tag

Comparing huenicorn vs. `Aurora-App-Linux` side by side on real content, blue
scenes rendered green/pink and red scenes rendered blue — looked like a
processing-side hue bug. It wasn't: `X11Grabber.cpp` tagged every 32bpp
XShm frame `PixelFormat::RGBA`, but a standard X11 TrueColor visual on a
little-endian host stores pixels red-mask-high, which lands in memory as
B,G,R,X — really BGRA. This tag was **ported verbatim from huenicorn**,
which has the identical mistagging — but it never mattered there, because
huenicorn's `Algorithms::mean()` hardcodes `Color{mean[2],mean[1],mean[0]}`
and never once reads the format tag. Aurora's own port made `mean()`/
`rgbaToRgb()` correctly format-aware (a real, separate improvement) — which
means it started trusting a label that was always wrong for X11, turning a
long-dormant mislabeling into a live R/B channel swap. The same
hardcoded-RGBA mistagging existed in `PipewireFrameBuffer.hpp`'s
`toOwnedRgbaImage`, regardless of which of several negotiated Pipewire
formats (including 3-byte RGB and YUV, which the fixed 4-byte-per-pixel
decode path can't handle at all) was actually delivered.

**Fix:** `X11Grabber` now tags `BGRA`/`BGR` to match the real memory layout;
`toOwnedImage` (renamed) takes the actual negotiated format instead of
assuming RGBA, and the Pipewire negotiation itself was narrowed to only the
3 formats the fixed-4-byte decode path can actually handle correctly
(RGBA/RGBx/BGRx — dropping RGB/YUY2/I420). **Confirmed on real hardware**:
colors matched huenicorn after this fix, closing the original comparison
that found the bug. General principle: when a "port
with a fix" changes code from ignoring a piece of metadata to trusting it,
audit where that metadata was actually set, not just the consuming logic —
upstream's own bugs can be invisible for as long as nothing reads them.

---

## PipeWire's daemon running and connectable doesn't mean any real audio device nodes exist
Tags: input, audio, pipewire, wireplumber, linux
Applies-when: PipeWire answers but lists no real devices

Preparing to test the new `AudioGrabber`, `pw-cli ls Node` on the real
target machine listed exactly two nodes: `Dummy-Driver` and
`Freewheel-Driver` -- PipeWire's own internal graph-clock drivers, nothing
else. Looked like a capture-side bug at first. It wasn't: `aplay -l`
confirmed real hardware (USB audio, HDA, NVidia HDMI) was present and
ALSA-visible the whole time, but `wpctl`/`wireplumber` weren't even
installed. PipeWire itself only manages the graph; a session manager
(WirePlumber, or the older pipewire-media-session) is what actually
creates Sink/Source nodes for real hardware and sets defaults. Without one
running, `pw-cli` connects fine and reports a perfectly healthy graph --
just one with nothing real in it.

**Fix:** `sudo apt install wireplumber` (this project's actual fix), then
`systemctl --user restart pipewire pipewire-pulse wireplumber` to pick it
up without a full logout. General principle: "the daemon is running and I
can query it" is a weaker signal than it looks for anything whose real
content is a *session manager's* job, not the core service's -- check the
layer that actually owns device/node creation, not just that the socket
answers.

---

## The installed SPA/PipeWire dev headers can lack API the code was written against, and it's a compile error, not a version-check failure
Tags: input, pipewire, spa, headers, linux
Applies-when: building against distro PipeWire dev headers

`Aurora-Input-Linux`'s `AudioGrabber.cpp` failed to build twice on the real
target machine (Ubuntu 22.04, `libspa-0.2-dev`/`libpipewire-0.3-dev`
0.3.48) even though `pkg-config` confirmed both were installed: first
`#include <spa/param/audio/raw-utils.h>` (no such file --
`spa_format_audio_raw_parse`/`build` actually live in `format-utils.h` on
this version), then, once that was fixed and the default-sink-discovery
code got exercised, `spa_json_begin_object`/`spa_json_object_find` (no
such functions -- this version's `spa/utils/json.h` only has the older
token-iterator API: `spa_json_init` + `spa_json_enter_object` +
repeated `spa_json_next` calls to walk key/value pairs by hand).

**Fix:** read the actual installed header (`grep -n "^static inline" .../json.h`),
not upstream docs or examples that may target a newer SPA, and rewrite
against what's really there. General principle: "the dev package is
installed" only confirms presence, not API surface, for a library whose
convenience helpers are still being added upstream -- verify against the
exact header on the exact target machine before trusting an include or
function name a newer environment (or an LLM's training data) suggested.

---

## Adding a second `pw_core_sync` round-trip can turn a dormant dangling-listener bug into a live, hard-to-place segfault
Tags: input, pipewire, async, listeners
Applies-when: adding async requests inside PipeWire callbacks

Fixing the discovery race above (`_onRegistryGlobal` re-issuing
`pw_core_sync` after binding the "default" metadata object, so loop-exit
waits on *that* reply instead of the earlier enumeration sync) immediately
started segfaulting on real hardware. `gdb -batch -ex run -ex bt` pointed
straight into `pw_main_loop_run()` itself with garbage frames above it
(`0x18`, `0x0`) -- a stack-corruption signature, not an app-code line to
stare at. Root cause: `_resolveDefaultSinkName`'s core "done" listener
(`pw->coreListener`) was registered against a `pw_core_events` struct that
was **local to that function's stack frame**, attached to `core` itself
(the long-lived connection, unlike the registry/metadata proxies, which
get destroyed -- and their listeners cleaned up with them -- before the
function returns) and never explicitly removed. This was already wrong
before the discovery-race fix, but harmless in practice: the *original*
single sync's `Done` reliably arrived and quit the loop before the
function returned, so no reply was ever left in flight afterward. The
second sync changed that -- now a reply could genuinely still be in
transit when `_resolveDefaultSinkName` returned, and when it arrived it
dispatched through a vtable pointer into stack memory the caller had
already reused for its own locals (the real audio-capture setup code that
runs right after).

**Fix:** `spa_hook_remove(&pw->coreListener)` before returning, same as
the registry listener right below it. General principle: when a fix adds
a *new* async request from inside an existing callback, re-audit every
listener's removal lifecycle in that whole call chain, not just the
listener the new request obviously relates to -- a previously-dormant
"this listener's owning stack frame is gone before a reply can arrive"
bug can go from unreachable to reliably reproducible the moment a second
round-trip actually gets left in flight. Absence of a prior crash is not
evidence the removal was correct, only that the dangling window was never
filled.

## WSL2 has no real X11/Wayland session, so `aurora-app-linux`'s auto-selecting "linux" input throws there, not just degrades
Tags: input, wsl2, sessiondispatch, testing
Applies-when: runtime-testing the Linux app under WSL2

Runtime-testing the new reload entrypoint in WSL2, `aurora-app-linux` failed
outright at startup with `"No capture backend available for this session --
falling back to 'dummy' input is an explicit choice, not automatic"` --
`SessionDispatch::selectBackendFromEnvironment`'s real, intentional behavior
(see `registerInputs`'s own explicit-choice comment) when neither a real X11
display nor a real Wayland/Pipewire session is present, which is exactly
WSL2's actual environment. Not a bug in the reload work being tested -- the
"linux" auto-select input would have thrown identically before this session
touched anything.

**Fix:** pre-seed `config.json` with `{"activeInputName": "dummy"}` (or set
it via a settings PUT before whatever's actually being tested) for any WSL2
runtime test of `aurora-app-linux` that reaches input construction --
`"dummy"` sidesteps `SessionDispatch` entirely rather than trying to make a
real capture session exist in an environment that fundamentally has none.
Worth doing by default for WSL2 runtime tests, not just after hitting this
once.

---

## A cached GPU staging buffer needs re-validating against the *current* frame, not just created once and trusted forever
Tags: input, d3d11, staging-buffer, windows
Applies-when: caching GPU or shared-memory buffers across frames

`WindowsGrabber::grabFrameSubsample()` creates its D3D11 staging texture
once, on first use, sized to that first frame's own
`D3D11_TEXTURE2D_DESC`, then reuses the same texture on every later tick
(`if(!m_stagingTexture){ ... }`) without ever re-checking it against the
*current* frame's own desc. `AcquireNextFrame`'s returned texture can in
principle change size/format between ticks (display-mode change, DPI
change, a monitor swap) -- copying such a frame into the stale-sized
staging texture and reading its `RowPitch` back can produce a step smaller
than the new frame's own tightly-packed row size, and `cv::Mat`'s row-step
constructor `CHECK`-asserts on that, crashing the whole daemon process, not
just this one grab call. `WindowsInputAnalysis.md` had already flagged
"RowPitch can exceed the tightly-packed row size" as a known, handled
direction (GPU alignment padding, harmless) -- the *smaller*-than-expected
direction was never considered, since the design research never asked "and
what if the cached buffer itself is now stale."

**Fix:** re-check the staging texture's own dims/format against the
current frame's `desc` on every call, recreating it on any mismatch, plus
an independent `RowPitch >= expected minimum` guard immediately before
either `cv::Mat` construction that logs and skips just that one frame
(matching every other transient-failure branch already in this function)
rather than trusting the recreate-on-mismatch logic alone to make the crash
structurally impossible. General principle: a resource cached across calls
specifically to avoid recreating it every time (a staging texture, a
buffer sized off an initial handshake) needs its *own* per-call validity
check against whatever it was cached to match — "created once, correct at
creation time" quietly becomes "assumed correct forever" the moment the
guard against staleness is left out, and the failure mode (a hard native
assert) doesn't give a debugger-free live session any warning before it
takes the whole process down.

---

## A process-global library init/deinit pair must not live in a per-instance constructor/destructor when the app deliberately overlaps old and new instances
Tags: input, pipewire, lifecycle, reload, globals
Applies-when: putting process-global init/deinit in a reloadable instance

Live Video↔Audio switching on Linux segfaulted after a few successful swaps
(`Aurora running: input='linux'` / `audio input='linux-audio'` alternating,
then `Segmentation fault`). Both `AudioGrabber` and `PipewireGrabber` called
`pw_init()` per instance (constructor/worker thread) and `pw_deinit()` per
instance (teardown) — but `pw_init()`/`pw_deinit()` are process-global, not
per-connection, and `PipelineHost::reload()` fully builds the replacement
pipeline before tearing down the old one, so consecutive same-mode reloads
briefly hold two live grabbers at once. The old instance's `pw_deinit()`
pulled the globals out from under the new one (and a second teardown
double-freed), which survived a swap or two before crashing — the same
"teardown racing a replacement that already started" shape as `output.md`'s
`shutdown(isReplacement)` bug, one layer down. The tell was consecutive
same-mode rebuilds in the log: any per-instance global teardown is
use-after-free the moment two same-kind instances overlap.

**Fix:** `PipewireRuntime::ensurePipewireInitialized()` (`Aurora-Input-Linux`,
`std::call_once`, shared by both grabbers), with intentionally no matching
`pw_deinit()` anywhere — a bounded one-time leak at process exit beats a
use-after-free on every live reload. Same precedent `X11Grabber` already set
in this repo (`XInitThreads()` once, never un-done). General principle: when
an app's reload design overlaps the old and new instances by construction,
audit every per-instance constructor/destructor pair for process-global
calls hiding inside it — init/deinit, `XInitThreads`-style one-time setup,
global refcounts — and hoist those to init-once; "balanced within one
lifetime" is only balanced if no second lifetime can ever overlap it.
