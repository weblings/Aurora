# Grabber / GnuLinux capture — Conversion analysis

**Sources:** `huenicorn/include/Huenicorn/Grabber/**`,
`huenicorn/src/Grabber/**`, `huenicorn/include/Huenicorn/Platform/Adapters/GnuLinux/**`,
`huenicorn/src/Platform/Adapters/GnuLinux/**`

## What each piece currently does

| File | Role | Portable now or genuinely needs a real display? |
|---|---|---|
| `IGrabber.hpp` | Abstract base: monitor selection, `_divisors()`/`_selectValidDivisors()`/`subsampleResolutionCandidates()` (pure math), the `grabFrameSubsample()` contract. | The math is pure; the rest is an interface. |
| `DummyGrabber.hpp/cpp` | Animated solid-color source, zero OS dependency. | Fully portable — no display needed at all. |
| `GnuLinuxAdapter::_createGrabber` | Session-type dispatch: Gamescope direct-capture check (`GAMESCOPE_WAYLAND_DISPLAY` env var) → Pipewire (Wayland) → X11, else throws. | The *decision logic* is pure (string/env comparisons); actually constructing a grabber obviously isn't. |
| `X11Grabber.hpp/cpp` | Real X11 capture via XShm + Xrandr for monitor enumeration. Self-contained — only needs `libX11`/`libXext`/`libXrandr`, doesn't reference `Config` for anything beyond passing it to the base class untouched. | Needs a real X11 display to *run*, but the code itself has no dependency on anything not yet ported in Aurora. |
| `PipewireGrabber.hpp/cpp`, `XdgDesktopPortal.hpp/cpp` | Wayland capture via `xdg-desktop-portal`'s ScreenCast interface + Pipewire streams. 1091 lines combined, GLib/GIO/D-Bus async callbacks throughout (session negotiation, signal subscriptions, Pipewire stream setup) plus the Gamescope direct-node special case. | Read both headers fully; scanned the `.cpp` structure (every function is a static C-callback for GLib/Pipewire or session-state management) rather than every line, since the categorization doesn't change with more detail: genuinely nothing pure to extract. |

## Scope decision for this pass

Same shape as `ProcessingAnalysis.md`/`HueOutputAnalysis.md`, but the
pure-vs-I/O line falls in a different place here: X11 capture is
self-contained enough to port *mechanically* now (no missing Aurora-side
infrastructure — it never touched `Config` for anything real), even though
actually *running* it still needs manual verification on a real X11 session,
same as Hue's DTLS streaming needs a real bridge.

**Ported this pass:** `IInput` gains monitor selection + the pure divisor
math (was previously a stub missing this — see the `IInput` refinement
below). `DummyGrabber` — fully portable, useful on its own as a
no-display-needed fallback. `X11Grabber` — mechanically ported, builds, needs
a real X11 session to manually verify capture actually works (can't verify
in WSL2 either — WSLg is a virtualized Wayland compositor, not real X11
hardware capture, same reasoning that pointed at needing real Ubuntu for this
step much earlier). The session-type dispatch logic is ported as a pure,
tested function (see below), separated from the act of constructing a grabber.

**Deferred, not skipped:** `PipewireGrabber`/`XdgDesktopPortal`. Reasons:
substantially larger (1091 lines vs. X11's ~460), Wayland/portal-specific
(most dev/test iteration can happen against X11 first), and a clean,
separable follow-up rather than something that needs to block this pass.

## A real bug found while hand-verifying `_divisors()` before porting it

```cpp
inline static Divisors _divisors(int number)
{
  Divisors divisors;
  for(int i = 1; i < number / 2; i++){
    if(number % i == 0){ divisors.push_back(i); }
  }
  divisors.push_back(number);
  return divisors;
}
```

`i < number / 2` excludes `number / 2` itself even when it's a genuine
divisor. Confirmed numerically: `_divisors(6)` returns `{1, 2, 6}`, missing
`3`; `_divisors(12)` returns `{1, 2, 3, 4, 12}`, missing `6`. Not a crash —
`subsampleResolutionCandidates()` (which this feeds) just silently offers
fewer valid resample resolutions to the setup UI than it should.

**Fix:** `i <= number / 2`. Confirmed this doesn't break `_selectValidDivisors()`'s
`std::set_intersection` precondition (needs sorted input) — `number` is always
≥ every other divisor, so appending it last keeps the vector sorted either way.

## `IInput` refinement

The first-draft `IInput` (written before this analysis pass, flagged as
provisional at the time) was missing monitor selection entirely. Fixed now,
generalized from `IGrabber`:

- `MonitorData` (name/width/height/refreshRate/isPrimary) moves into the
  `Input` interface module, not `Contracts` — it's Input-side vocabulary
  Processing/Output never touch, unlike `ImageData`.
- `_divisors()`/`_selectValidDivisors()`/`subsampleResolutionCandidates()`
  port as free functions (or static interface methods) — pure integer math,
  fully testable independent of any real grabber.
- `hasCustomScreenManagement()`/`selectMonitor()`/`monitors()` port as
  virtual methods on `IInput`, same contract `IGrabber` already had.
- `selectedMonitor()`'s original try/catch-and-log-a-warning became explicit
  bounds checks returning `nullptr` silently — `Core::Logger` isn't ported to
  Aurora core yet, so the warning log couldn't come along too.

## The session-dispatch logic, made testable

`GnuLinuxAdapter::_createGrabber()` calls `std::getenv()` directly and
constructs a real grabber inline, so none of its branching was ever testable
without an actual desktop session. Split into two pieces on the port:

- A pure function taking the relevant env values as plain strings/optionals
  and returning *which backend* to use (an enum), fully unit-testable.
- A thin wrapper that reads the real env vars and does the actual
  construction, matching today's behavior exactly.

## Minor cleanup made during the otherwise-mechanical `X11Grabber` port

`_initMonitorsList()` computed `minX`/`minY`/`maxX`/`maxY`/`minRefreshRate`
tracking variables that were never actually read anywhere afterward — dead
code, apparently left over from an unfinished "combined multi-monitor view"
feature (the stray comment `// Add whole display surface to choices if there
are multiple screens` above the final `swap()` suggests as much). Dropped;
no behavior change, since nothing consumed those values either way.

## Output files

```
Aurora/core/Input/include/Aurora/Input/IInput.hpp     (refined: monitor selection added)
Aurora/core/Input/include/Aurora/Input/MonitorData.hpp
input/linux/include/Aurora/Input/Linux/DummyGrabber.hpp
input/linux/include/Aurora/Input/Linux/X11Grabber.hpp
input/linux/include/Aurora/Input/Linux/SessionDispatch.hpp  (the testable pure logic)
input/linux/src/*.cpp
input/linux/tests/LinuxInputTests.cpp
```

`PipewireGrabber`/`XdgDesktopPortal` intentionally not listed at the time —
covered by the follow-up pass below.

---

# Follow-up pass: `PipewireGrabber` / `XdgDesktopPortal`

Full read of both `.cpp` files (previously only structurally scanned).
**Pipewire itself isn't Wayland-specific** — it's a general audio/video
routing daemon. What's Wayland-specific is `xdg-desktop-portal`'s ScreenCast
interface, which exists because Wayland (unlike X11) requires user consent
before any app can read the screen; Pipewire is just the transport the portal
hands back a stream over. Noted here since the `_PIPEWIRE` CMake option name
and this doc's title shorthand "Wayland capture" for that combination, not
because Pipewire itself is tied to Wayland (relevant later if an audio-input
plugin reuses the same dependency).

## What's genuinely pure vs. inherent I/O

Same shape as the X11 pass: this is overwhelmingly D-Bus/GLib async-callback
session negotiation (`XdgDesktopPortal`, ~530 lines) plus Pipewire
thread/stream setup (`PipewireGrabber`, ~500 lines) — neither is unit-testable
as a whole, both need a real Wayland compositor + portal backend to verify.
Two genuinely pure pieces were worth extracting this time (bigger win than
the X11 pass found, since frame decoding itself turned out separable):

- **Gamescope node matching** (`_onRegistryGlobal`'s string comparison) —
  extracted as `matchesGamescopeNode(bool isNodeInterface, const char*
  nodeName)`, zero Pipewire types in its signature, so it's testable without
  `libpipewire` installed at all.
- **Raw buffer → owned `ImageData`** (the core of `_onStreamProcess`) —
  extracted as `toOwnedRgbaImage(data, width, height, stride)`, taking a
  plain pointer instead of `spa_buffer`. This is the actual frame-capture
  correctness logic (dimensions, stride-vs-tightly-packed handling, and that
  the result *owns* its memory rather than aliasing Pipewire's buffer, which
  becomes invalid after `pw_stream_queue_buffer`) — arguably the most
  important thing to regression-test in this whole file, and it turned out
  fully separable from the real `pw_stream`/mmap plumbing around it.

## Bugs found while porting

**Missing early return in `onCreateSessionResponseReceivedCallback`:** on
`response != 0` (session creation denied/cancelled), the original logs a
warning but falls through anyway, reading `session_handle` out of a `result`
that was never validated and calling `selectSource()` on a half-initialized
`Capture`. Every sibling callback (`onStartResponseReceivedCallback`,
`onSelectSourceResponseReceivedCallback`) does return in this situation —
this one just missed it. **Fix:** added the `return`.

**Unnecessary `strdup` leak in `getSenderName()`:** `strdup`'s the D-Bus
unique name into a raw `char*` to hand to a `std::string` constructor, then
never frees it — the `strdup` was pointless, since `std::string`'s
`const char*` constructor already copies. **Fix:** dropped the `strdup`,
construct directly from the pointer GLib already owns.

## `Core::Config*` dependency, resolved without Config/Runtime existing yet

`XdgDesktopPortal::Capture::config` and `PipewireData::config` exist for
exactly one purpose: persisting the portal's "restore token" (so the user
isn't re-prompted for screen selection every launch) via
`config->restoreToken()`/`setRestoreToken()`. That's a two-method surface,
not a reason to pull in a full `Config`/`Runtime` system this plugin doesn't
otherwise need.

**Fix:** defined a minimal `IRestoreTokenStore` (get/set optional string)
local to this plugin, plus a `NullRestoreTokenStore` default (always prompts,
matches today's behavior when no store is wired up). When Aurora core gets a
real `Config`, a `Config`-backed implementation can satisfy the same
interface without touching `PipewireGrabber`/`XdgDesktopPortal` at all —
same pattern as the `IInput`/`IOutput` interfaces already used for the
Input/Output module boundary itself.

## Output files

```
input/linux/include/Aurora/Input/Linux/IRestoreTokenStore.hpp
input/linux/include/Aurora/Input/Linux/GamescopeNodeMatch.hpp   (pure, tested)
input/linux/include/Aurora/Input/Linux/PipewireFrameBuffer.hpp  (pure, tested)
input/linux/include/Aurora/Input/Linux/XdgDesktopPortal.hpp
input/linux/include/Aurora/Input/Linux/PipewireGrabber.hpp
input/linux/src/XdgDesktopPortal.cpp
input/linux/src/PipewireGrabber.cpp
input/linux/tests/PipewireTests.cpp
```

Needs a real Wayland session + portal backend to manually verify capture
actually works end-to-end — same caveat as `X11Grabber`, can't be done from
this Windows machine or WSL2/WSLg.
