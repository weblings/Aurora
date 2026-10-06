# Input / capture-backend lessons

Capture/grabber/platform-adapter specific gotchas. See
[`README.md`](README.md) for how entries get routed here vs. elsewhere.

---

## A non-blocking poll on an event-driven capture API can starve indefinitely instead of ever returning real data
Tags: input, dxgi, capture, polling
Applies-when: polling an event-driven capture API with a zero timeout

`WindowsGrabber`'s DXGI Desktop Duplication port used
`AcquireNextFrame(0, ...)` — a non-blocking poll, planned in
[[windows-input-analysis]] to reproduce `X11Grabber`'s poll-anytime semantics
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
The same trap recurred when writing up huenicorn's `mean()` for upstream
([[upstream-findings]] finding 1): the write-up claimed every grabber tags
`BGR`, and only a re-read of the grabbers before fixing it (`Aurora-h45.1`)
caught that the fix must ship with the tag corrections.

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
just this one grab call. [[windows-input-analysis]] had already flagged
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

---

## A PipeWire format fraction is not a value -- reduce num/denom before trusting either half
Tags: input, pipewire, spa, framerate
Applies-when: reading a negotiated PipeWire fraction as a plain number

`PipewireGrabber::displayRefreshRate()` returned `max_framerate.num` raw as Hz. PipeWire fractions are frequently unreduced, so one backend negotiated a numerator of 15729223 -- persisted via Orchestrator's derive-from-display into config.json, the runtime loop then ran at 15.7M "updates per second" and wedged the daemon; the UI's untimed fetches hung in bootstrap, so every launch showed a blank page with the bad value surviving restarts because it was persisted. Same family as the narrowed-format fix that stopped trusting PipeWire's format tag.

**Fix:** reduce the fraction (`num / denom`, `denom == 0` means unset) at the grabber boundary, clamp `Config::setRefreshRate` to a sane max so no future garbage source can persist, sanitize on `ConfigStore` load, and time out the UI's localhost probes so a hung daemon shows "unreachable" instead of blank. General principle: negotiated PipeWire fields are wire representations, not values.

---

## GNOME Wayland: PipeWire screen capture freezes on the first frame of a fullscreen window
Tags: input, pipewire, wayland, gnome, fullscreen, validation
Applies-when: validating capture with a fullscreen/kiosk window, or debugging "colors stuck" reports during fullscreen video

Driving solid colors through a Firefox page: maximized, capture tracked every 1.5s change; after F11 it delivered one correct fullscreen frame, then held it ~18s while the page kept alternating, resuming the moment fullscreen exited. Two `--kiosk` launches froze the same way on Firefox's first paint (constant black, then constant near-white) -- which first looked like a broken test page, not a capture problem. Direct scanout was the first suspect and a flag test did not support it; the cause turned out to be the memfd stream getting empty CORRUPTED buffers (see "On GNOME 46 Wayland, a memfd screencast stream got empty CORRUPTED buffers in fullscreen while a LINEAR DMA-BUF stream tracked"). Tracked as `Aurora-1t1`; fullscreen video is the core use case.

**Fix:** since 1t1 phase 3 the grabber offers LINEAR DMA-BUF by default and fullscreen tracks on GNOME 46 (one machine verified). The freeze comes back whenever the stream ends up on memfd: `AURORA_PW_DMABUF=0`, or a driver where the DMA-BUF fallback fired (`[pw-dmabuf] ... renegotiating shared memory` in the log). In those cases validate with maximized, not fullscreen/kiosk, windows. A `[pw] capture stalled` line in the log is this freeze's signature. When a capture reading is constant across stimuli, suspect the source froze before suspecting the stimulus.

---

## A bare Mach-O binary's TCC permission grant attaches to whatever launched it, not the binary -- even with an embedded Info.plist
Tags: input, mac, tcc, permissions, screencapturekit
Applies-when: designing a macOS capture-permission story for a CLI-launched binary

Built a throwaway probe (`Aurora-8mk.4`) calling `SCShareableContent` two ways -- bare `exec`, and with `-sectcreate __TEXT __info_plist` embedding a real Info.plist/`CFBundleIdentifier` -- and ran both directly from Terminal. Both attributed the Screen Recording grant to Terminal itself in System Settings, not the probe binary: the embedded plist section alone didn't change TCC's responsible-process walk, because the binary was still `exec`'d directly by the shell rather than launched through LaunchServices. Wrapping the same binary as a real `.app` bundle (`Contents/{Info.plist,MacOS/<bin>}`) and launching it with `open` fixed it immediately -- the bundle showed up as its own entry, separate from Terminal. Confirmed the same fix on the real app target (`aurora-app-mac` built as a `MACOSX_BUNDLE`, `Aurora-8mk.11`).

**Fix:** an embedded Info.plist section on a bare binary is not equivalent to a real bundle for TCC-attribution purposes -- only a LaunchServices launch (`open`/double-click) resets the responsible-process chain. A tool needing its own TCC identity (Screen Recording, Camera, etc.) still needs the full bundle directory structure even if it's meant to be launched via `open` rather than double-clicked; the plist-section trick is good enough to derisk notarization's Info.plist requirement, but not sufficient for permission attribution on its own.

---

## Once an app holds its own TCC identity, macOS separately gates its access to protected folders too -- not just camera/mic/screen
Tags: input, mac, tcc, permissions, dev-environment
Applies-when: testing macOS permission flows from a dev checkout

After the bundle fix above made `Aurora.app` its own TCC-attributable process, a second, unrelated-looking prompt appeared on first launch -- "Aurora wants to access your Documents folder" -- despite the code only reading `~/Library/Application Support/Aurora` (not a protected folder). The actual cause: this repo checkout lives under `~/Documents/Coding/Aurora/Aurora`, and `AURORA_WEBUI_SOURCE_DIR` (the dev-mode WebUI static-files fallback) is baked to an absolute path inside it -- so merely serving static files from the repo counted as "app accessing Documents," gated independently of Screen Recording. Not a bug in Aurora; a property of where the dev checkout happens to sit.

**Fix:** don't chase folder-access prompts as capture-permission bugs before checking whether the repo/build dir itself sits under a TCC-protected folder (Documents/Desktop/Downloads/iCloud Drive) -- a real install location won't reproduce this. Once a process gets `open`-launched bundle identity, every protected folder its own file reads touch becomes independently gated, not just the capture APIs under test.

---

## Direct-display ScreenCaptureKit capture triggers a second, separate TCC gate beyond Screen Recording -- "bypass the system picker"
Tags: input, mac, tcc, permissions, screencapturekit
Applies-when: building an SCContentFilter from `initWithDisplay:excludingWindows:` (whole-display capture, not the user-facing picker)

`ScreenCaptureKitGrabber` (`Aurora-8mk.5`) builds its `SCContentFilter` directly from a chosen `SCDisplay`, never showing Apple's `SCContentSharingPicker` UI -- the right shape for a background ambient-light daemon, which shouldn't pop a window-picker on every launch. On a real run (macOS Sequoia+), granting Screen Recording wasn't the end of it: a second system alert appeared, "Aurora is requesting to bypass the system picker and directly access your screen and audio," gating actual frame delivery independently of the Screen Recording grant (the stream's own `startCaptureWithCompletionHandler` had already reported success before this appeared -- it's a separate, later gate, not a startup failure). `CGDisplayCreateImage` (the older, pre-ScreenCaptureKit capture API) is also gone as of macOS 15 -- `SCShareableContent`/`SCStream` is required, not just preferred, and `kCGDirectDisplayNull` isn't in this SDK's public headers either (a plain `0` is `CGDirectDisplayID`'s own invalid sentinel).

**Fix:** expect two independent consent gates for this capture shape, not one -- Screen Recording (System Settings) and the bypass-picker system alert (a runtime prompt, not a Settings toggle) -- and don't treat the second as a bug when `startCaptureWithCompletionHandler` already reported success; it's macOS gating actual frame delivery after setup succeeds. General principle: an API "succeeding" per its own completion handler doesn't mean the OS has finished gating it.

---

## An ad-hoc-signed dev binary's Screen Recording grant doesn't survive a rebuild, even for the same bundle identifier -- and the first-ever request resolves as "denied," not "pending"
Tags: input, mac, tcc, permissions, screencapturekit
Applies-when: testing `Aurora-8mk.8`-style permission-recovery flows, or any live grant/deny cycle against a locally-built `.app`

Verifying the permission-recovery flow (`Aurora-8mk.8`) live, with the user granting Screen Recording through a real System Settings dialog: the very next full quit+relaunch still came back `permission_denied`. `tccutil reset ScreenCapture com.aurora.app` found a real, resettable grant (not "no such bundle identifier"), confirming a grant existed -- just not one this rebuild's identity matched. Root cause is the same fact [[mac-permissions]] already reasoned through (an ad-hoc signature's hash is derived from the binary's own contents, so it changes on every `cmake --build`, and TCC keys the grant to that identity) -- this session is the first time it was actually walked through live end to end rather than just designed around: rebuild the target between a grant and a retest (as ordinary iterative dev work does constantly) and the grant silently stops applying, with no error indicating *why* it's denied again. `tccutil reset ScreenCapture <bundle-id>` cleared the stale entry; one more full quit+relaunch with a fresh dialog answered then succeeded (confirmed via `/api/monitors` returning the real display).

Separately: `SCShareableContent`'s completion handler did *not* hang toward `ScreenCaptureKitGrabber`'s 5s bound while a permission dialog was pending -- it resolved in well under a second with zero displays (`Aurora-8mk.8`'s `PermissionErrorKind::Denied`, not `::Pending`), while the OS asynchronously surfaced the actual dialog moments later on its own schedule. The `Pending` (timeout) code path exists for a real API contract (the completion handler is documented as potentially not firing until the user answers), but wasn't observed to fire in practice here even on a never-before-asked identity -- "denied" appears to be the actual first-request behavior, with the dialog arriving out-of-band rather than gating the call that triggers it.

**Fix:** after granting a permission mid-development, always fully quit and relaunch before retesting -- and if it's still denied, check whether the binary was rebuilt since the grant before assuming the recovery-flow code is broken; `tccutil reset <service> <bundle-id>` is the fast way to confirm a stale entry is the cause (an error means no entry ever existed; success means one did, and just didn't match). Don't design a "pending" state's UX around the assumption that a fresh dialog blocks the triggering call -- empirically here it doesn't, so a caller can't distinguish "dialog just appeared, uncertain" from "already denied" by timing alone.

**Follow-up (Aurora-d3ec, macOS 27, `open`-launched ad-hoc `Aurora.app`):** a fresh grant does apply to the *running* process, no relaunch needed. After `tccutil reset ScreenCapture com.aurora.app`, a relaunch (GET /api/state: `failed`, source `startup`, `permission_denied:`), then Aurora turned on in System Settings without quitting, `PUT /api/state {"running":true}` rebuilt the pipeline and the host went `running`. The failing run just before it (grant toggled, rebuilt binary, still denied after a relaunch) was the stale-entry case above, so "still denied after a grant" means check for a stale entry first, not "needs a relaunch". The fix line's "always quit and relaunch" is therefore too strict for the retest loop: reset, relaunch once to get a clean denial, grant, retry. The user-facing wording can say "turn it on, then try again" and keep quit-and-reopen as the fallback. One macOS version and one launch path; not yet checked for the Linux portal or the audio tap.

---

## A TCC consent dialog appearing doesn't mean the API call it's for was blocked -- confirmed on a second Apple capture API, not just ScreenCaptureKit
Tags: input, mac, tcc, permissions, coreaudio, process-tap
Applies-when: designing permission-state detection for a macOS capture API that has no explicit pending/denied signal

Probed the process-tap -> aggregate-device -> IOProc chain for `Aurora-9z4.1` (Mac audio-terminal support) with a throwaway bundled probe (`AudioProbe.app`, mirroring `Aurora-8mk.4`/`.11`'s Screen Recording probe shape exactly). Both a bare Terminal-exec run and an `open`-launched run from the real bundle (a never-before-run identity) delivered real, 100%-non-zero system audio starting from the very first `IOProc` callback -- no delay, no zero-buffer window. The user, watching the screen in real time, reported a dialog appeared during *both* runs, but couldn't identify which permission either one was for, and the probe's bundle identity never appeared as its own entry in System Settings afterward despite genuinely capturing real audio.

Most likely explanation: the same finding already on record above for `SCShareableContent` (*"an API 'succeeding' per its own completion handler doesn't mean the OS has finished gating it"*) generalizes to `AudioDeviceStart` too -- the OS surfaces its consent dialog asynchronously, on its own schedule, without gating the call that triggers it, so a dialog can appear after capture has already started succeeding. Not confirmed with certainty (the user couldn't attribute the dialogs, so a standing prior grant on the launching process is an alternative explanation that can't be ruled out either) -- recorded as the leading hypothesis, not a settled fact.

**Fix:** don't design a permission-state UX around "a visible dialog means the call is currently gated" for *any* macOS capture API in this codebase, not just ScreenCaptureKit -- treat "dialog appeared" and "data is flowing" as independent observations that can both be true at once. When an API also gives no explicit pending/denied signal at all (Core Audio's process-tap path never does -- every call returns `noErr` regardless of grant state, confirmed by Apple's own forum reply that no programmatic check exists), don't chase a cleaner signal via manual observation either -- this session found that even a human watching the screen in real time couldn't reliably attribute which dialog belonged to which permission. Design the recovery flow around behavioral inference (e.g. sustained all-zero output over a known-active window) instead of an event to wait for.

---

## A Core Audio process-tap aggregate device delivers one interleaved buffer, not one mono buffer per channel
Tags: input, mac, coreaudio, process-tap, pixel-format
Applies-when: writing an AudioDeviceIOProc against a tap+aggregate-device, or porting logic that assumes CoreAudio's HAL is always non-interleaved

`AudioBufferList` is documented in a way that allows either shape -- a single buffer holding all channels interleaved, or one mono buffer per channel (CoreAudio's classic AUHAL canonical format, which is non-interleaved) -- so `MacAudioGrabber` (`Aurora-9z4.3`) was written to handle both rather than assume one. Checked directly against the real callback (a throwaway probe logging `mNumberBuffers`/`mNumberChannels`/`mDataByteSize` for the first few calls) before trusting either path: for the `initStereoGlobalTapButExcludeProcesses` + aggregate-device shape `Aurora-9z4.1`/`.3` use, the HAL delivers exactly **one buffer** with `mNumberChannels == 2`, already interleaved -- matching `kAudioDevicePropertyStreamFormat`'s own report on the aggregate's input scope (48kHz, 2ch, packed float, confirmed by a second direct query) rather than contradicting it.

**Fix:** don't assume a Core Audio callback's `AudioBufferList` shape from general HAL folklore ("HAL audio is non-interleaved") -- for this tap+aggregate-device combination specifically, it's a single interleaved buffer, and `Contracts::AudioBuffer`'s own contract wants exactly that shape. Keep the non-interleaved branch as a defensive fallback (cheap, matches what the API type permits) but don't expect it to ever actually run against this specific capture path. A different aggregate-device configuration (e.g. more sub-devices, or a per-app tap instead of a global one) would need its own direct check, not an assumption transferred from this one.

---

## A Settings toggle showing "enabled" doesn't mean a Screen Recording grant actually works -- two different consent dialogs exist, and only one of them grants anything
Tags: input, mac, tcc, permissions, screencapturekit
Applies-when: a Screen Recording request still fails with `-3801`/`no shareable displays` after the System Settings toggle already reads "on"

`Aurora-z4q`: live video<->audio handoff testing hit `SCStreamErrorDomain -3801` ("The user declined TCCs...") persistently, surviving a scoped `tccutil reset ScreenCapture com.aurora.app` (which confirmed a real, matching stale entry existed) plus five separate full quit+relaunch cycles, an explicit deliberate off/on toggle click, and a 20-second fully idle wait before a single clean retest -- ruling out both "just needs a relaunch" (the `Aurora-8mk.8` lesson above) and two live-tested alternative hypotheses (TCC rate-limiting from repeated rapid requests, and a concurrent-enumeration race similar to [a reported upstream issue](https://github.com/takezou621/kilde/issues/90)); neither survived an idle-wait + single-request retest. A throwaway bundled probe (mirroring `Aurora-8mk.4`'s shape, with and without a proper `NSApplication`/run loop) reproduced the same instant, dialog-free `-3801` on a *brand-new* identity that had never been prompted before -- and crucially, that identity never appeared in the Settings list at all, which a normal per-app TCC decision always does. That combination (instant decline, no list entry) means the request never reached TCC's normal per-app decision flow at all.

What actually fixed it: after the scoped reset, retrying produced a *different* system dialog than every prior attempt -- one with an inline **Approve** button, not the Settings-only/Deny pair seen every previous time (self and this project's own precedent in `MacPermissionRecovery.js`'s design assumed Screen Recording is *never* inline-grantable). Clicking Approve directly worked immediately, confirmed via `GET /api/monitors` returning the real display. Every earlier "Settings" click had only navigated to the pane without itself granting anything, leaving whatever toggle state was visible disconnected from a working grant -- so a toggle reading "on" was necessary but not sufficient evidence of a real grant, and cycling quit/relaunch against a non-grant did nothing because there was nothing valid underneath to take effect.

**Fix:** when `-3801` persists despite an "enabled" toggle, don't keep cycling quit/relaunch against it -- run `tccutil reset <service> <bundle-id>` (scoped, not the blanket service-wide reset) first; its success/failure message is ground truth for whether a matching entry exists at all, which the visible toggle is not. After a reset, expect the *next* consent dialog's exact shape to vary (Settings/Deny vs. an inline Approve) -- only the Approve variant grants anything immediately, and a Settings-routed toggle can visually read "on" without backing a working grant. Don't design a permission-recovery UX (or a debugging session) around a single assumed dialog shape for this API.
---

## A promise wait that includes a human dialog needs a human-scale bound -- don't copy machine-handshake timeouts literally
Tags: input, pipewire, portal, permissions, timeout
Applies-when: bounding an async wait on Linux where a permission/source dialog may appear mid-handshake

`Aurora-1z9`: the portal fd future only settles after the user answers the source-picker dialog, so the in-repo `wait_for(5s)` precedent (AudioGrabber, a machine-only handshake) would have turned every slow first-run human into a spurious failure. The two waits in one constructor needed different bounds for different reasons.

**Fix:** 60s for the portal wait (covers a human reading the dialog; dismissal still resolves promptly as false with its own message), 5s for the post-fd stream-params wait (no human in the loop). When a bead says "copy the timeout pattern", check whether a dialog sits inside the wait first.

---

## An unresolvable PipeWire target.object readies and links to the default sink instead of failing
Tags: input, linux, pipewire, audio, target.object, fallback
Applies-when: assuming a typo'd audioTargetSinkName fails loudly at AudioGrabber construction

`AudioGrabber`'s constructor assumed a typo'd `targetSinkName` never fires
`param_changed`, so the 5s ready timeout would surface it as a reload error.
Verified live on PipeWire 1.0.5 + WirePlumber (Aurora-4vf): a stream with
`target.object=no-such-sink-bogus` still negotiated format (ready), and
`pw-dump` showed it linked active to the real default sink's monitor ports --
the session manager silently falls back to the default instead of failing.

**Fix:** "construction succeeded" proves nothing about *which* sink is
captured on the explicit path; typo validation needs an explicit registry
membership check against real node names, not the ready timeout. Don't treat
a negotiated stream as proof its target resolved -- confirm the link target
independently (`pw-dump` link inspection) before trusting it.

---

## Arming a PipeWire loop timer can silently break registry enumeration on the same loop -- bound the wait with a worker thread instead
Tags: input, pipewire, loop, timer, async, linux
Applies-when: bounding a pw_main_loop_run wait with a pw_loop timer

Bounding `enumerateAudioSinks()`' sync round-trip (Aurora-67y) with a 3s
one-shot `pw_loop_add_timer` + `pw_loop_update_timer` before
`pw_main_loop_run` made the sync Done arrive instantly with zero registry
globals -- no error, `update_timer` returned 0, the timeout callback never
fired, and the sink list came back empty. Bisected hard: timer
added-but-disarmed enumerated fine; armed (before or after `pw_core_sync`,
null or zero interval, block-scope or hoisted timespecs) broke it every
time. Mechanism unknown -- a timer value cannot explain the server sending
Done with no preceding globals, yet removing the arm fixed it
deterministically on PipeWire 1.0.5.

**Fix:** bound the wait the way `AudioGrabber`'s constructor already does --
run the loop on a worker thread, `wait_for` 3s on a future, and on timeout
`pw_main_loop_quit` from this thread (proven cross-thread-safe by `_stop`)
under a mutex-guarded loop pointer (cleared by the worker before teardown,
so a late quit can't hit a destroyed loop), then join and report empty.
General principle: when a wait needs a bound on a PipeWire loop, prefer the
thread+quit shape already proven in this repo over a loop timer -- the
timer API's failure mode here was silent data loss, not an error.

---

## Bluetooth "Connected" is not an audio transport -- check the bluez5 profile, not the link
Tags: input, audio, bluetooth, pipewire, wireplumber, linux
Applies-when: a paired and connected Bluetooth device exposes no PipeWire nodes

AirPods Pro showed `Connected: yes` in bluetoothctl with full A2DP
UUIDs and a bluez5 Device in `wpctl status`, yet PipeWire exposed zero
nodes for them: `wpctl inspect` showed `bluez5.profile = "off"` and
`api.bluez5.connection = "disconnected"` -- the baseband/BLE link was
up with no A2DP transport acquired, so sink enumeration (correctly)
listed only the built-in sink.

**Fix:** select the device in Sound settings (or `wpctl set-profile`)
to acquire the transport, then re-check `wpctl status` Sinks. General
principle: layer the question -- bluetoothctl answers the radio link,
only the bluez5 profile answers whether audio exists.

---

## Switching a bundle from ad-hoc to a Developer ID signature strands the old TCC grant: Settings shows "on" but access is denied, and no consent dialog appears
Tags: input, mac, tcc, permissions, codesign, developer-id
Applies-when: a previously-granted Screen Recording or audio-capture permission stops working, or never prompts, right after the same bundle ID is first signed with a real identity (or the identity changes)

First launch of the notarized, Developer ID-signed `Aurora.app` (bundle ID `com.aurora.app`) showed the "Screen Recording permission is off" card with Aurora toggled on in System Settings and no Allow dialog. The earlier ad-hoc builds had a cdhash-only designated requirement; the Developer ID build has an identifier + certificate requirement (`codesign -dr -`). TCC matches grants to that requirement, so the ad-hoc row no longer matched the new code, yet the row's existence kept macOS from prompting (Aurora-qy5 cert prep).

**Fix:** quit the app, run the scoped resets (`tccutil reset ScreenCapture com.aurora.app`, and the audio-capture service), relaunch, approve the fresh dialog, then quit and relaunch once more. After that the grant persisted across a relaunch with no re-prompt; a certificate-based requirement is stable across rebuilds signed by the same identity, which is what ad-hoc builds lacked. Expect the same re-prompt when moving back to an ad-hoc build that shares the bundle ID.

---

## ScreenCaptureKit delivers whatever size you configure -- at full Retina pixels, the CPU downscale alone overruns a 60Hz tick
Tags: input, mac, screencapturekit, performance, tick, gpu-scaling
Applies-when: choosing a capture size for a grabber whose frames get downsampled anyway, or when Mac video mode is CPU-heavy

`configureAndStartStream` set `SCStreamConfiguration.width/height` to the display's full pixel size (points x `backingScaleFactor`, deliberately, so Retina didn't capture at half resolution). Every tick then INTER_AREA-resized ~3420x2214 BGRA down to `subsampleWidth` (16) on the CPU: 2349/2360 tick-thread samples in `cv::resizeArea_`, ~105% CPU, and the overrunning tick starved the WebUI through `PipelineHost`'s lock (Aurora-3qh, mechanism Aurora-cgr). SCK scales on the GPU for free when the configured size is smaller, and `-[SCStream updateConfiguration:completionHandler:]` changes it on a live stream without a restart.

**Fix:** `IVideoInput::setCaptureWidthHint(width)` (default no-op), called by `Orchestrator::init` with `subsampleWidth`; the Mac grabber delivers an 8x oversample, at least 256px, never above full pixel size, so the CPU's INTER_AREA still averages the last step. Result: ~5.5% CPU, `/api/monitors`/`/api/zones` < 1ms, tick thread ~95% asleep. `displayResolution()` still reports full pixels (subsample candidates unchanged). When verifying, low CPU is also what a *failed* capture looks like (ticks skipped while unhealthy) -- confirm real frames: distinct per-zone colors on the light tap, a real display from `/api/monitors`, no permission errors in the log.

Also observed: the rebuilt, still ad-hoc-signed `Aurora.app` kept capturing when relaunched by `devstack.py` -- consistent with "A bare Mach-O binary's TCC permission grant attaches to whatever launched it" above (the launcher's grant applied), not with the rebuild-invalidates-grant lesson, which concerns a bundle launched on its own.

---

## In a promise-driven portal callback chain, every early return must settle the promise -- "just return" turns a bad state into a hang
Tags: input, linux, pipewire, xdg-portal, promise, huenicorn
Applies-when: adding or reviewing an error/denial branch in `XdgDesktopPortal`'s response callbacks (or any async chain a caller blocks on via a future)

`PipewireGrabber`'s constructor waits on `fdReadyFuture` while
`XdgDesktopPortal` walks CreateSession → SelectSources → Start through D-Bus
response callbacks. Only the Start callback settles the promise on denial.
The CreateSession and SelectSources denial branches return without it, so
the waiter is never woken. huenicorn's wait is unbounded (permanent hang);
Aurora's is bounded at 60s, so a denied dialog stalls for a full minute
despite the comment saying it "resolves promptly as false" (`Aurora-p91`,
fixed: every non-cancelled branch now settles through
`XdgDesktopPortal::settle`, which sets once and records `failureReason`).
Upstream finding 5's original suggested fix, a bare `return;`, would have
added a third hang. The same gap hid at *init*: `initScreencastCapture`
returned false on no session bus or no ScreenCast proxy (no portal
installed, likely the commonest real case) and its caller ignored the
return, so that path stalled the full 60s too. Count the setup returns, not
only the callbacks.

The D-Bus *call* error branches (CreateSession, SelectSources,
OpenPipeWireRemote) have the same gap (upstream finding 10). And huenicorn's
CreateSession denial, which falls through instead of returning, doesn't
just half-initialize: it passes a null session handle on as an object path
and segfaults (reproduced with a fake portal, `Aurora-h45.5`).

**Fix:** every terminal branch of the chain, denial or call error, calls
`capture->fdReadyPromise.set_value(false)` before returning, except
`G_IO_ERROR_CANCELLED` (our own teardown, nobody waiting). When reviewing a
"missing return" fix, trace who is waiting on the state the early return
skips.

---

## xdg-desktop-portal ScreenCast failure paths are testable offline -- fake the portal on a private `dbus-run-session` bus
Tags: input, linux, xdg-portal, dbus, testing, huenicorn
Applies-when: verifying a portal denial/error branch in `XdgDesktopPortal` (huenicorn's or Aurora's) without a real Wayland portal or a human clicking Deny

The portal code only talks to `org.freedesktop.portal.Desktop` on the session
bus, so a ~60-line Python/Gio fake is enough. It owns that name and registers
`org.freedesktop.portal.ScreenCast` at `/org/freedesktop/portal/desktop`, with
`CreateSession`/`SelectSources`/`Start` and the `version`/`AvailableCursorModes`
properties. Each method returns the request path
`/org/freedesktop/portal/desktop/request/<sender minus ':' with '.'→'_'>/<handle_token>`
and then emits `org.freedesktop.portal.Request.Response(u a{sv})` on it from
`GLib.idle_add`, after the reply, since the client subscribes before calling.
A code of 1 means denied; `invocation.return_dbus_error` simulates a call
error. The driver links `XdgDesktopPortal.cpp` + `Logger.cpp` + gio, stubs the
two `Config` restore-token methods, and copies `PipewireGrabber`'s
constructor: portal thread, `wait_for` on the promise, then `_stop()`'s
teardown. Run it as `dbus-run-session -- bash -c "python3 fake.py MODE & gdbus
wait --session org.freedesktop.portal.Desktop; ./driver"`. Built with `-O0`:
the portal thread spins on a plain `bool`. This turned 5/9/10 in
[[upstream-findings]] from "needs a real portal" into a before/after
reproduction, including a segfault on `develop` nobody had seen.

**Fix:** use this pattern instead of declaring portal branches untestable.
It now lives in `tools/fake-xdg-portal` (`run.sh --ref <branch> [--asan]`);
the first copy sat in a scratchpad and was lost.
`gdbus wait` avoids a sleep race on the name; keep the bus private so the
real portal is never touched.

---

## A GLib async callback still runs after cancellation -- don't dereference `userData` that a cancel handler may already have freed
Tags: input, linux, glib, xdg-portal, lifetime, huenicorn
Applies-when: adding code to a `g_dbus_proxy_call` (or any GIO async) completion callback in `XdgDesktopPortal` that reads its `userData`

`XdgDesktopPortal` hands one `DbusCallData*` to both the Response-signal
subscription and the method call's completion callback. It's freed by the
Response callback on the normal path, or by `onCancelledCallback` when
teardown cancels the `GCancellable`. GIO still invokes every pending
completion callback afterwards, with `G_IO_ERROR_CANCELLED`. So a completion
callback that dereferences `userData` unconditionally (as huenicorn's
`onStartedCallback` does at the top) can read freed memory if teardown races
an in-flight call. While adding finding 10's fix (`Aurora-h45.11`), the
dereference went inside the non-cancelled branch only. On that path no
Response comes, so nothing has freed the data yet.

Reproduced in Aurora's port (`Aurora-p91`): `PortalTokenTests`' fake emits
the Response *before* the method reply (`Mode::ResponseFirst`), and ASan
reports a heap-use-after-free in `onStartedCallback`. The portal docs don't
order reply before Response, so this isn't only a teardown race. Aurora now
hands the completion callbacks `capture` (which outlives the call) instead
of the `DbusCallData`.

**Fix:** in GIO completion callbacks, check the error first and touch
`userData` only on paths where you can name who still owns it. Treat
`G_IO_ERROR_CANCELLED` as "my owner is tearing down" and return without
reading shared state.

---

## "Default" audio capture means different things per platform: Mac taps every app, Linux and Windows capture one default device
Tags: input, audio, mac, linux, windows, process-tap, pipewire, wasapi
Applies-when: adding audio device selection, or comparing audio capture behavior across platforms

With no device configured, each grabber captures something different.
Mac's `MacAudioGrabber` uses `initStereoGlobalTapButExcludeProcesses:@[]`,
which is everything every process plays, whatever output it goes to. The
default output UID only sets the aggregate device's clock sub-device.
Linux's `AudioGrabber` resolves the default sink by name once at start and
captures that sink's monitor, so later default-sink changes aren't followed.
Windows uses miniaudio loopback with `pDeviceID = nullptr`, the default
playback device. It probably follows default changes through miniaudio's
WASAPI stream routing, but that is unverified. So a dropdown whose first
option is "today's default" is broader on Mac ("all audio") than on Linux
and Windows ("default output"). Picking a specific device on Mac narrows
capture to audio routed to that device. Found while scoping Aurora-9k1.

**Fix:** label the default option per platform, or make Linux and Windows
truly capture everything (one capture per device, mixed). Don't assume the
same config value means the same capture everywhere.

---

## A fake portal must answer Response unicast, and GTestDBus waits 30 s on a process-wide connection
Tags: linux, portal, dbus, testing, gdbus
Applies-when: faking org.freedesktop.portal.Desktop for a test, or using GTestDBus with a long-lived bus connection

`XdgDesktopPortal` subscribes to `Request.Response` with `G_DBUS_SIGNAL_FLAGS_NO_MATCH_RULE`, so it sends no AddMatch and relies on the portal addressing the signal to the caller, as real portals do. A fake that emitted the Response as a broadcast looked fine on the wire (the signal was sent) but was never delivered, and the handshake timed out with no error. Separately, `g_test_dbus_down` waits up to 30 s for the singleton session connection to finalize; `XdgDesktopPortal` keeps `m_connection` for the whole process, so every test process paid 30 s (a 2-minute ctest for four cases) plus a "Weak notify timeout" warning.

**Fix:** emit the fake's Response with the caller's unique name as destination, and derive request and session paths from that name (`:1.1` becomes `1_1`) plus the caller's token. Start a plain `dbus-daemon --session --nofork --print-address=1` child, set `DBUS_SESSION_BUS_ADDRESS` from its first line, and kill it directly. Run the fake on its own connection and thread, and carry its setup failures back through a promise rather than test assertions, which are not safe to call off-thread in the Catch2 3.6 we use (unverified against its docs).

---

## A test that spawns a child bus must keep the child's stderr off the runner's pipe, or one crash stalls ctest for its whole timeout
Tags: input, linux, dbus, testing, ctest
Applies-when: a test fixture starts a long-lived child process (`dbus-daemon`, a fake server) and a case under it can crash

`PortalTokenTests` starts `dbus-daemon --session` as a child. A case that
segfaulted (the reproduced use-after-free, `Aurora-p91`) never reached the
fixture's `force_exit`, orphaning the daemon. The daemon had inherited
ctest's stderr pipe, so ctest saw the pipe stay open and waited out its
300 s timeout per crashed case instead of reporting the crash.

**Fix:** start the child with `G_SUBPROCESS_FLAGS_STDERR_SILENCE` (stdout is
already piped for the address). After any crashed run, `pkill` the stray
daemons before rerunning. Catch2 test names containing commas can't be passed
as a filter by name; use a wildcard prefix.

---

## `g_variant_new` with a non-floating `@` argument adds a ref instead of stealing one
Tags: input, linux, glib, gvariant, testing, leak
Applies-when: building GVariants by hand (a fake portal, a D-Bus reply) and mixing `g_variant_ref`, `g_variant_ref_sink` and `g_variant_builder_end`

`g_variant_builder_end` returns a *floating* variant, which `g_variant_new`
consumes. A variant that is already sunk (owned) is not consumed: the new
container takes its own ref. The fake portal's first `_answer` did
`g_variant_ref(results)` before handing it to `g_variant_new("(u@a{sv})")`,
so every reply leaked 64 bytes plus children (648 B in the early-Response
case), and `g_variant_ref_sink` on an already-owned variant added a third
ref.

**Fix:** pass floating variants straight in, or keep exactly one owned ref
and `g_variant_unref` it after the call; never `ref` just to pass it on.
LeakSanitizer pinpoints it (`g_variant_builder_end` as the allocation site).



---

## SSE frames still arriving does not mean capture is fresh
Tags: input, linux, pipewire, verification, devstack, light-tap
Applies-when: judging whether live capture is working from the light-viz relay SSE or `validate.py`

During the Aurora-1t1 kiosk run, the relay delivered about 60 frames/s for 30s while every zone stayed on one red (0.98/0.02/0.02) and the page on screen kept flipping red/blue. The output side keeps publishing whatever frame the grabber last held, so a frozen capture still looks like a healthy, flowing stream. With `AURORA_DEV_PW_TRACE=1` the cause in that run was PipeWire still calling back ~25/s with `size=0`, `SPA_CHUNK_FLAG_CORRUPTED` chunks, which `_onStreamProcess` discards before replacing the held frame.

**Fix:** judge capture by content changing, not by frames arriving: show a changing source (`pattern.html`) and run `validate.py color --track`. Frame counts alone only prove the output path. To see inside the grabber, run with `AURORA_DEV_PW_TRACE=1` (per-second callbacks, skips by reason, chunk flags).


---

## On GNOME 46 Wayland, a memfd screencast stream got empty CORRUPTED buffers in fullscreen while a LINEAR DMA-BUF stream tracked
Tags: input, linux, pipewire, gnome, mutter, dmabuf, fullscreen
Applies-when: a PipeWire/portal screen grabber freezes or serves a stale frame while a window is fullscreen on GNOME Wayland

Observed on one machine (Ubuntu, GNOME 46, 1920x1200 BGRx, `PipewireGrabber` negotiating no modifier): in kiosk fullscreen the stream kept calling back ~25/s but every chunk was `size=0` with `SPA_CHUNK_FLAG_CORRUPTED` over `SPA_DATA_MemFd`, and the grabber (which discards such chunks) served its last frame for 30s, 4 of 4 runs. GNOME's own screen recorder captured the same fullscreen page fine. Offering a mandatory LINEAR modifier first, requesting `DmaBuf` buffers and mapping the fd with `DMA_BUF_IOCTL_SYNC` tracked for the full 30s, 2 of 2 runs (windowed also passed). `MUTTER_DEBUG_PAINT=disable-direct-scanout` did not help. Not verified: tiled-only GPUs, other compositors, long soaks, and why GNOME fails the memfd record.

Later, with the productized path (buffers mapped once, checked syncs): window and kiosk both tracked again, and windowed CPU for the app was 68% of a core on DMA-BUF vs 79% on memfd (n=1 each, so noisy; DMA-BUF at least not costlier on this Intel-class machine).

**Fix (default since Aurora-1t1 phase 3; `AURORA_PW_DMABUF=0` forces memfd):** offer LINEAR DMA-BUF first with the plain format as fallback, and treat CORRUPTED/empty chunks as "no new frame". Diagnose with `AURORA_DEV_PW_TRACE=1` before changing negotiation.


---

## Falling back from DMA-BUF mid-stream is a param update, not a reconnect -- but the DmaBuf-only Buffers request has to be replaced too
Tags: input, linux, pipewire, dmabuf, negotiation, fallback
Applies-when: a PipeWire consumer that negotiated DMA-BUF needs to drop to shared memory at runtime (mmap or sync fails, unsupported driver)

A modifier can be negotiated and the CPU read can still fail afterwards (mmap of the dmabuf fd refused, `DMA_BUF_IOCTL_SYNC` erroring), so a negotiation-time fallback alone can leave capture blank on a bad driver. `PipewireGrabber` (Aurora-1t1) counts failed DMA-BUF reads; after 3 in a row it signals a loop event that calls `pw_stream_update_params` with only the plain (no-modifier) EnumFormat. GNOME 46 renegotiated on the spot: a new `Format` without a modifier arrived in `param_changed`, then memfd buffers (`dataType=2`). The grabber had earlier sent a Buffers param restricting `dataType` to `DmaBuf`; on the no-modifier format it sends a replacement allowing MemFd|MemPtr. Not tested without that replacement, so whether a stale DmaBuf-only request would actually block memfd is unverified. Forced live with `AURORA_DEV_PW_DMABUF_FAIL=1` (every map fails), confirmed in the log, not just by a passing run.

**Fix:** do the renegotiation from a loop event (`pw_loop_add_event`/`pw_loop_signal_event`), not inline in `process`; rebuild EnumFormat without the modifier offer; on the next `param_changed` with no modifier, replace any DmaBuf-only Buffers param. Map dmabufs once in `add_buffer`/unmap in `remove_buffer`, and treat an unmapped buffer as a failed read so a driver that refuses mmap also lands in the fallback.


---

## An SCStream output that points at the grabber with a raw pointer crashes on teardown: SCK callbacks outlive the grabber, and no documented stop barrier says otherwise
Tags: input, mac, screencapturekit, lifetime, threading, crash
Applies-when: an Objective-C stream/capture delegate calls back into a C++ object (PIMPL state, mutex, frame buffer) that a destructor frees

`AuroraSCKStreamOutput` held `Impl*` (the grabber's state, including `frameMutex`) as a non-owning pointer, on the assumption that the grabber destructor's `stopStream` finished all callbacks first. It did not: switching Video to Audio destroys the grabber, and a sample callback still running (or queued) on `com.aurora.sck.output` then locked a freed mutex, `std::mutex::lock()` threw `system_error`, and the process aborted with SIGABRT (`Aurora-2026-10-04-*.ips`, three crashes, Aurora-eq7a). It reproduced on demand: about 125 rapid Video/Audio/pause switches, and the old build also died within two gentle (1s) switches or seconds after startup. Apple documents nothing about callbacks after `stopCapture`'s completion handler or about output/delegate lifetime, and SCStream holds outputs weakly on Sonoma and later, so the completion handler is not a barrier you can lean on (AVCaptureSession documents `stopRunning` as blocking until callbacks finish; SCStream documents no equivalent). `stopStream` also waits at most 5s and frees regardless. Permissions were not involved: the crash happened with Screen Recording granted and no permission change.

**Fix:** give the callbacks shared ownership of the state they touch. `Impl` is `enable_shared_from_this`, the grabber holds `shared_ptr<Impl>`, the output holds a `shared_ptr<Impl>` attached before `addStreamOutput`, and each callback copies it to a local first. `Impl` holds `output`/`stream` strongly, a cycle that `stopStream` and `didStopWithError:` break by clearing them. Keep `didStopWithError:` alive with `objc_precise_lifetime` because clearing `impl->output` can drop the last strong ref to `self`. Verify with a rapid mode-switch loop against the real capture, not by reasoning about ordering: 3,000+ iterations clean after the fix.

---
