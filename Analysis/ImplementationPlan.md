# Low-scope implementation plan

Five phases to prove out the Input/Processing/Output split
([`ModuleSplitPlan.md`](ModuleSplitPlan.md)) as a real, running vertical slice,
plus one deferred stretch. Order matches how the phases were scoped. Phase
2.5 (audio) was inserted later, independent of phases 3–5 — it doesn't
renumber anything since it isn't sequentially gated by the browser work.

## Guiding principles

- Each phase ends in something demonstrable/runnable, not just code moved around.
- **Refactor first, prove no regression** before adding anything new — phase 1's
  restructured app must behave identically to today's huenicorn before phase 2
  touches anything.
- **`huenicorn/` stays an untouched reference clone.** Aurora's own module-split
  code goes in a new sibling directory, never edited in place — the same
  relationship RockyRoad keeps to ChartPlayer (`MusicThing/ChartPlayer` stays
  pristine; `RockyRoad/v2` is the distillation).
- **Compile-time modules, not dynamic plugins — and, as of 2026-09-13, separate
  repos per plugin.** A plugin implements the shared `IInput`/`IOutput`
  interface and gets linked at build time, same shape as huenicorn's
  `Platform::Selector` (`#ifdef`-based compile-time adapter choice), just
  generalized — still true. What changed: each plugin now lives in its **own
  repo** (`Aurora-Input-Linux`, `Aurora-Output-Hue`, ...), not inside Aurora
  core, so a plugin's own dependencies (`pipewire`/`libX11` for Linux capture,
  `mbedtls`/`CURL` for Hue's DTLS+REST) aren't forced onto Aurora core or onto
  unrelated plugins. See `ModuleSplitPlan.md`'s "Repo split" section for the
  full reasoning, including why this is *not* the same thing as license
  independence between plugins. A real hot-swappable runtime-loaded plugin
  system (stable ABI, `.dll`/`.so` loading, discovered by the web UI) is a
  separate, bigger decision — still deferred, see Stretch.
- **WebSockets deferred.** The browser bridge (phase 3) uses the existing
  httplib-based HTTP server with chunked responses (MJPEG for video preview,
  Server-Sent Events for effect/zone ticks) — zero new network dependency. True
  WebSocket duplex is a stretch "networking fork" after all five phases land,
  for when bidirectional/binary efficiency actually earns its keep.
- **Analysis pass before touching each section.** Before porting or extending
  any existing code — huenicorn's C++ (phase 1), its HTTP server (phase 3),
  RockyRoad's IWSDK/XR scaffolding (phase 4), or a third-party library's actual
  API (`interactive-shader-format-js`, phase 5) — write a holistic per-section
  analysis doc first, same shape as RockyRoad's own component docs
  (`SongPlayer.md`, `Camera3D.md`: what it does, what the new module actually
  needs from it, what maps directly vs. what needs rework). Goes in `Analysis/`
  alongside `FirstScan.md`. This is what "holistic view before starting" means
  in each phase below — not a one-time exercise, a per-section step every
  phase repeats.

## Proposed directory layout

`Aurora/` below is this git repo's own root (it has its own `.git`, separate
from huenicorn's). `huenicorn/` is **not** inside it — it's a plain sibling
clone on disk (this machine has both under one parent folder; that parent
folder isn't itself a repo and isn't architecturally significant). No git
link between the two: same relationship RockyRoad keeps to ChartPlayer (no
`.gitmodules` there either) — a reference codebase being read and distilled
into new code, not a compiled dependency, so it's cited by upstream URL in
prose (`https://gitlab.com/openjowelsofts/huenicorn.git`), not linked in git.
Submodules stay reserved for an actual future build-time dependency, if one
ever gets vendored as source.

Repo layout as of the 2026-09-13 split — one core repo, one repo per plugin,
all siblings on disk (not architecturally required, just this machine's
arrangement, same as `huenicorn/`):

```
../huenicorn/            <- untouched upstream reference clone, not in any Aurora repo
Aurora/                  <- core repo
  core/
    Contracts/             <- DONE: neutral shared types (ImageData, UV, Color,
                               Interpolation, Frame/Zone) — see ModuleSplitPlan.md
      include/Aurora/Contracts/
      src/Interpolation.cpp
    Processing/            <- DONE: ImageProcessing, ported with 3 bug fixes
                               found during the port, see ProcessingAnalysis.md
      include/Aurora/Processing/ImageProcessing.hpp
      src/ImageProcessing.cpp
      ISF/                 <- new (phase 5, native side is minimal — see below)
    Input/                 <- DONE: IInput.hpp (refined with monitor selection +
                               divisor math, see LinuxCaptureAnalysis.md) + MonitorData.hpp.
      include/Aurora/Input/                          Concrete plugins live in their own repos now.
    Output/                <- DONE: IOutput.hpp, now with zoneIds() for live
                               zone discovery (see RuntimeAnalysis.md).
      include/Aurora/Output/IOutput.hpp
    Runtime/               <- DONE, see RuntimeAnalysis.md: Config/ConfigStore,
                               ZoneMap/ZoneMapStore (one profile file per
                               plugin), reconcileZoneMap, composeFrame,
                               Smoother (RGB, keyed per (outputId, zoneId)),
                               pickDefaultSubsampleWidth, and Orchestrator
                               (ties one IInput to any number of IOutputs
                               per-tick, no threading/timing of its own --
                               tested against FakeInput/FakeOutput). Not yet
                               built: a real app entry point/main() driving
                               it with real plugins in a real timed loop.
      include/Aurora/Runtime/
      src/
    tests/                 <- DONE (Processing + Runtime coverage): Catch2, see
                               ProcessingAnalysis.md/RuntimeAnalysis.md's test plans
  web/                    <- new: the browser client (phases 3-5)
  Analysis/               <- already exists
Aurora-Input-Linux/       <- plugin repo, DONE for X11 + Pipewire (see
                             LinuxCaptureAnalysis.md): DummyGrabber,
                             SessionDispatch (tested pure logic), X11Grabber
                             (mechanically ported, builds against real
                             X11/Xext/Xrandr, needs a real X11 session to
                             manually verify actual capture), PipewireGrabber/
                             XdgDesktopPortal (mechanically ported, builds
                             against libpipewire-0.3/glib-2.0, needs a real
                             Wayland session + portal backend to manually
                             verify; gamescope-node matching and raw-buffer-
                             to-ImageData conversion extracted as pure, tested
                             helpers this pass). Restore-token persistence
                             (huenicorn's Core::Config dependency) resolved
                             via a minimal local IRestoreTokenStore interface
                             rather than waiting on Aurora core's Config/
                             Runtime. One CMake option per backend
                             (AURORA_INPUT_LINUX_ENABLE_X11/_PIPEWIRE) so unrelated
                             deps aren't forced — X11 and Wayland are one plugin's
                             two auto-selected backends, not two separate plugins
                             (see ModuleSplitPlan.md's repo-split section).
Aurora-Output-Hue/        <- plugin repo, DONE (see HueOutputAnalysis.md): pure
                             logic (Colorimetry, Channel, HuestreamHeader/Payload,
                             BridgeAddress, Credentials byte-conversion) plus the
                             full I/O layer -- HttpClient (libcurl), ApiTools
                             (5 pure JSON-parsers + mechanical REST wrappers),
                             EntertainmentConfigurationSelector, DtlsClient/
                             MbedTlsImpl (Mbed TLS v3)/Streamer, and HueOutput :
                             IOutput tying it all together. Builds against real
                             libcurl/Mbed TLS; needs a real bridge to manually
                             verify capture actually reaches real lights.
Aurora-App-Linux/         <- new app repo, DONE (see DistributedArchitecturePlan.md
                             for why this got its own repo): Registry (name ->
                             factory for compiled-in plugins, tested) + main.cpp
                             (registers plugins per AURORA_APP_ENABLE_*, picks
                             which to run from Config::activeInputName()/
                             activeOutputNames(), drives Orchestrator::update()
                             in a real timed loop). First executable combining
                             all three repos -- builds and links clean against
                             every native dependency (X11, Pipewire/glib,
                             libcurl, Mbed TLS). Real end-to-end run (real
                             display + real bridge) pending the Ubuntu device.
```

**Aurora core build-verified.** No toolchain existed on the Windows dev
machine, so a WSL2 Ubuntu environment was set up (`build-essential`, `cmake`,
`libopencv-dev`, `libglm-dev` via `apt`) — built from `~/aurora` on WSL's
native filesystem, not the Windows-mounted `/mnt/d` path, which hit real CMake
`configure_file` permission failures (a known DrvFs limitation, not a code
problem). One real CMake bug found and fixed along the way: `enable_testing()`
was called inside `tests/CMakeLists.txt` instead of the parent
`core/CMakeLists.txt`, so the test binary built fine but `ctest` couldn't
discover it — fixed by moving `enable_testing()` to the parent scope, before
`add_subdirectory(tests)`. **Result: 8/8 tests passing**, covering all three
regression fixes plus the pure `Color` math. Both lessons recorded in
`Analysis/lessons/engineering-hygiene.md`.

**`Aurora-Output-Hue` build-verified** — same WSL2 flow, copied into
`~/AuroraProjects/{Aurora,Aurora-Output-Hue}` (matching casing needed for the
`../Aurora/core` sibling path in its `CMakeLists.txt`). No new `apt` packages
needed — the ported pure logic only needs OpenCV+glm, already installed.
**Result: 10/10 tests passing**, including a sanity check that white maps
within 0.001 of the real CIE D65 white point (0.3127, 0.3290) — confirms the
colorimetry port is actually correct, not just internally self-consistent.
One real bug found and fixed: the test file's `using namespace
Aurora::Output::Hue;` didn't bring `Aurora::Contracts` into scope, so
`Contracts::UVCorner` didn't resolve — fixed to `using namespace
Aurora::Contracts;` with the now-redundant `Contracts::` prefix dropped at
each call site.

**`Aurora-Input-Linux` build-verified (X11 backend)** — needed one new `apt`
package set installed by the user (`libx11-dev libxext-dev libxrandr-dev`;
this session doesn't run `sudo`), otherwise same WSL2 flow. **Result: 5/5
tests passing**, including the `_divisors()` regression test (a 12×6 input
now correctly yields all 4 valid candidate resolutions, not the 2 the
off-by-one bug limited it to). Hit the identical `using namespace
Aurora::Output::Hue;`-shaped mistake again — added `using namespace
Aurora::Contracts;` to the test file but forgot to strip the still-present
`Contracts::` prefixes at each call site, so it didn't actually fix anything
the first time. Recorded as a recurrence in `engineering-hygiene.md`, not
just a repeat fix. `X11Grabber.cpp` itself compiled cleanly against real
X11/Xext/Xrandr; actually verifying capture still needs a real X11 session,
which neither this Windows machine nor WSL2 (WSLg is a virtualized Wayland
compositor, not real X11 hardware capture) can provide.

**`Aurora-Input-Linux` build-verified, Pipewire included** —
`libpipewire-0.3-dev`/`libglib2.0-dev` were missing on first pass (checked
via `pkg-config`), so per this session's no-`sudo`-via-tool-call rule that
install was left to the user; once installed, reconfigured with default
options (both `AURORA_INPUT_LINUX_ENABLE_X11`/`_PIPEWIRE` on) and rebuilt.
`PipewireGrabber.cpp`/`XdgDesktopPortal.cpp` now compile cleanly against real
`libpipewire-0.3` (1.6.2) and `glib-2.0`/`gio-2.0`/`gio-unix-2.0` (2.88.0),
zero errors or warnings. **Result: 11/11 tests passing** (5 pre-existing + 6
new: gamescope node matching, raw-buffer-to-`ImageData` conversion including
a stride-vs-tightly-packed regression check). Actually exercising capture
still needs a real Wayland session + portal backend, which this Windows
machine/WSL2 can't provide (same caveat as `X11Grabber`).

Two real bugs found while porting `XdgDesktopPortal` (see
`LinuxCaptureAnalysis.md`): a missing early `return` in
`onCreateSessionResponseReceivedCallback` that let a denied/cancelled session
fall through to use an unvalidated result, and a pointless `strdup` leak in
`getSenderName()`. Both fixed. Also flagged as a lesson (not fixed, since
consistent with prior ports): dropping `Core::Logger` calls for the lack of
an Aurora-core logger is now costing real diagnostics twice over, worth
prioritizing before the next I/O-heavy port (Hue's `Streamer`/DTLS layer).

**`Aurora/core`'s new `Runtime` module build-verified** — added
`nlohmann_json` as a new core dependency (same find-package-else-`FetchContent`
pattern as glm; huenicorn already uses this exact library). Built
`Config`/`ConfigStore`, `ZoneMap`/`ZoneMapStore`, `reconcileZoneMap`,
`composeFrame`, `Smoother` per the decided `RuntimeAnalysis.md` shape (RGB
smoothing in Runtime, one profile file per plugin). **Result: 16/16 core
tests passing** (8 pre-existing Processing + 8 new Runtime). Also rebuilt
`Aurora-Output-Hue` (10/10) and `Aurora-Input-Linux` (11/11) against this
updated core to confirm the `IOutput::zoneIds()` interface addition doesn't
break either — neither has a concrete `IOutput` implementation yet, so
nothing needed updating. As part of the same pass, removed
`Aurora-Output-Hue`'s now-dead `Channel::previousXyb`/`hasPreviousXyb`
(XYB-space smoothing state made obsolete by the RGB-in-Runtime decision) —
rebuilt clean, no test changes needed.

**`Orchestrator` build-verified against fakes** — added `pickDefaultSubsampleWidth`
(huenicorn's `_initSettings()` subsample-width search, ported as a pure
function) and `Orchestrator` itself, gluing `IInput`/`IOutput` together with
no threading/timing of its own. Tested with a `FakeInput`/`FakeOutput` pair
in `core/tests/OrchestratorTests.cpp` — first proof that `Config`/`ZoneMap`/
`reconcileZoneMap`/`composeFrame`/`Smoother` actually compose into a correct
per-tick loop, not just individually correct in isolation. **Result: 23/23
core tests passing** (8 Processing + 8 Runtime pieces + 3 subsample-default
+ 4 Orchestrator). `Runtime`'s `add_subdirectory` had to move after
`Input`/`Output` in `core/CMakeLists.txt` since `Orchestrator` now depends
on both interfaces — rebuilt `Aurora-Output-Hue` (10/10) and
`Aurora-Input-Linux` (11/11) against the reordered core to confirm neither
plugin was affected.

**Hue's full I/O layer build-verified, `HueOutput` now exists.** Two new
native dependencies installed by the user (`libcurl4-openssl-dev`,
`libmbedtls-dev`); built and tested in three stages, each verified before
the next: (1) `HttpClient`/`ApiTools`/`EntertainmentConfigurationSelector`
against real `libcurl` — 2 real upstream bugs found and fixed, also logged
in `UpstreamFindings.md`; (2) `DtlsClient`/`MbedTlsImpl`/`Streamer` against
real Mbed TLS (v3 API only — the installed 3.6.5 doesn't need huenicorn's
v4 branch); (3) `HueOutput : IOutput` itself, the first concrete `IOutput`
implementation to exist in Aurora. Writing `HueOutput::send()` surfaced a
real gap — nowhere for a user's per-zone gamma setting to persist — closed
by adding `gamma` to both `Runtime::ZoneConfig` and `Contracts::Zone`
(reversing the earlier "gamma is Hue-specific" call; see
`HueOutputAnalysis.md`). **Result: 22/22 `Aurora-Output-Hue` tests
passing.** Rebuilt `Aurora` core (24/24) and `Aurora-Input-Linux` (11/11)
against the `Contracts::Zone` field addition — both still clean.

**`Aurora-App-Linux` build-verified — first assembled multi-plugin
executable.** Extended `Runtime::Config` with `activeInputName`/
`activeOutputNames` (24/24 core tests still passing) so `main()` picks
plugins by name instead of hardcoding which classes to construct. New
repo's `Registry` (4/4 tests) is the name→factory seam; `main.cpp` wires it
to a real timed loop. Configuring pulled in every dependency across all
three repos at once (OpenCV, glm, nlohmann_json, X11, Pipewire/glib,
libcurl, Mbed TLS, Threads) with no collisions — confirmed by the resulting
binary's `ldd` output resolving every native library cleanly. **Real bug
found on the first actual run:** the "linux" auto-select input threw
`std::runtime_error` when no capture backend was available (expected in
WSL2, no real X11/Wayland session), and nothing in `main()` caught it —
`std::terminate`/abort instead of a clean error. Fixed with a function-try
block around `main()`. Confirmed both failure paths now exit cleanly with a
message (no backend available; no output configured) rather than aborting.
Real end-to-end verification (real display + real bridge) is next, on the
Ubuntu device — see `DistributedArchitecturePlan.md` for the architecture
question this app's shape feeds into.

**First real hardware pass, on the actual Ubuntu device (2026-09-13): all
four repos build clean, first real end-to-end run against a real X11 desktop
and real Hue bridge succeeded.** Real X11 session this time (`DISPLAY=:1`,
`XDG_SESSION_TYPE=x11`), not WSL2 — first environment able to actually
exercise `X11Grabber` and `HueOutput`'s DTLS layer instead of just
build-verifying them. **One real bug found and fixed:** `Aurora-Output-Hue`'s
`CMakeLists.txt` did `pkg_check_modules(MBEDTLS REQUIRED ...)` with no
fallback — this machine's `libmbedtls-dev` (2.28.0-1build1, vs. the WSL2 dev
environment's 3.6.5) ships no `.pc` files at all, a known Ubuntu packaging
gap, not a code problem. Fixed by trying `pkg_check_modules` `QUIET` first,
then falling back to `find_library` for `mbedtls`/`mbedx509`/`mbedcrypto` and
wiring them into the same `PkgConfig::MBEDTLS` imported target name either
way. Once that was fixed, `MbedTlsImpl.hpp` (previously commented as
"only the Mbed TLS v3 API is ported/verified") compiled and ran correctly
against 2.28.0 unmodified — every call it makes is classic API stable across
2.x/3.x — so the comment was corrected to record both versions verified,
rather than left overclaiming a v3-only requirement. All four repos'
existing test counts unaffected: core 24/24, `Aurora-Input-Linux` 11/11,
`Aurora-Output-Hue` 22/22, `Aurora-App-Linux` 4/4.

**Credentials/zone-map transcription, not re-pairing.** This machine already
has a working `huenicorn` setup (`~/.config/huenicorn/{config.json,
profile.json}`) against the same real bridge — reused rather than re-paired.
`AURORA_HUE_BRIDGE_ADDRESS`/`_USERNAME`/`_CLIENTKEY` set from
`config.json`'s `bridgeAddress`/`credentials.{username,clientkey}` verbatim
(its `refreshRate` field was a corrupted/garbage huge value, not copied —
Aurora derives its own from the real display instead, landing on `60`).
`profile.json`'s six `channels` were hand-transcribed to
`~/.config/aurora/profiles/hue.json`'s `ZoneMap` shape: `uvA`/`uvB` →
`uvs.min`/`uvs.max` (same corner convention, confirmed by reading both
`UVs` structs and their JSON serializers), `gammaFactor` → `gamma` directly
(confirmed identical, not just similarly-named — huenicorn's
`glm::pow(2, -gammaFactor * factor)` and Aurora's `Hue::gammaExponent()` are
the same formula), `channelId` → `zoneId` unchanged. No `devices`/
`entertainmentConfigurationId` fields carried over — genuinely not part of
Aurora's generic `ZoneMap` by design (device membership and entertainment
config selection are `HueOutput`'s own live-discovery job now, not saved
state — see `RuntimeAnalysis.md`'s two-file-split section).

**Confirms the transcription was correct, not just accepted:** `HueOutput`
was constructed with no `entertainmentConfigurationId` override (empty
string auto-selects the bridge's first/only one, same as huenicorn's
default), and `Orchestrator::init()`'s `reconcileZoneMap` — saved zone map
∩ the output's live `zoneIds()` — kept all six hand-transcribed zones
active with their `uvs`/`gamma` unchanged after the run, meaning the live
entertainment configuration's channel IDs really are `{0..5}`, matching the
transcription exactly rather than silently dropping mismatched IDs to
inactive.

**The run itself:** `aurora-app-linux` printed `Aurora running: input='linux',
1 output(s)` — meaning `HueOutput::init()` (bridge REST discovery +
entertainment config selection + the actual DTLS-PSK handshake against the
real bridge) succeeded before that line prints, not after — then ran a real
capture→crop→stream loop against the live X11 desktop for ~12 seconds via
`timeout -s TERM`, then shut down cleanly (`Stopping...`, no abort) on the
same signal path phase 1's earlier `std::terminate` fix already covered.
No errors surfaced from capture, streaming, or shutdown. The lights did not
actually react — see the follow-up below; the confident-sounding conclusion
above turned out to be built on an untouched file, not a working run.

**Follow-up: the lights didn't move, and it took two real bugs to find out
why.** User-reported, then root-caused live against the real bridge rather
than guessed at:

1. **Wrong entertainment configuration, silently.** The bridge has *two*
   entertainment configurations over the same six lights ("TV" and "TV
   area", both 6 channels) — `HueOutput`'s empty-ID default
   (`unordered_map::begin()`) picked whichever one hashed first, not
   necessarily "TV" (the one the transcribed `hue.json` assumes). Confirmed
   live: polled `/clip/v2/resource/entertainment_configuration/<id>` for
   both IDs while the app ran — "TV area" showed `status: active`, "TV"
   stayed `inactive`. **Fixed** by adding `AURORA_HUE_ENTERTAINMENT_CONFIG_ID`
   (optional env var, same stopgap shape as the other three) so `main.cpp`
   can pin the right one; `HueOutput`'s constructor already took this
   parameter; only `registerOutputs()` was missing the wiring.
2. **The real bug: `HueOutput::name()` returned `"Hue"`, capitalized —
   `profiles/hue.json` (lowercase, per this repo's own README) was never
   the file being read or written.** `Orchestrator::init()` derives the
   saved zone-map path directly from `output->name()`
   (`ZoneMapStore::load(output->name())`); on a case-sensitive filesystem
   that resolved to `profiles/Hue.json`, a second file the app silently
   created and reconciled against an *empty* saved map every run —
   `reconcileZoneMap`'s "new IDs default inactive" rule then zeroed out all
   six zones, so `composeFrame` omitted every zone and `HueOutput::send()`
   shipped header-only packets with no channel payloads all along. This is
   exactly why the earlier "reconciliation preserved all six zones, so the
   transcription must be correct" conclusion above was wrong — that check
   was reading `hue.json`, the file the app never touched; the file it
   actually used (`Hue.json`) told the opposite story. Confirmed empty
   (`ls -la` showed both files, `Hue.json` full of `"active": false`
   entries) before fixing. **Fixed** by renaming `HueOutput::name()`'s
   returned string to lowercase `"hue"`, matching the registry key
   (`registry.registerOutput("hue", ...)`) and the README's own documented
   filename — one call site (`HueOutputPluginTests.cpp`) updated to match;
   `Aurora-Output-Hue` 22/22, `Aurora-App-Linux` 4/4 still passing after.
   Deleted the stray `Hue.json` this bug had been writing.

**Confirmed working end-to-end after both fixes**, user watching: real X11
capture drove real color changes on the real lights over the real DTLS
stream, for the first time. Root-caused via direct probes rather than
guesswork at each step — a standalone `HueOutput`-only probe (explicit
config ID, solid RGB cycle) isolated the REST+DTLS path from capture; a
standalone `X11Grabber`-only probe (10 frames, checked `hasData()`/mean
color) isolated real capture from everything else; `ss -u -a -n -p` on the
running app's PID confirmed an `ESTAB` UDP socket to the bridge's port 2100
existed the whole time, ruling out a silently-swallowed DTLS handshake
failure (`Streamer`'s constructor deliberately swallows that exception,
matching huenicorn, which is why this needed checking rather than assuming).

**Windows toolchain stood up, and phase 2's `WindowsGrabber` built and
hardware-verified (2026-09-13).** No toolchain existed on the Windows dev
machine (VS 2022 Community was installed but missing the C++ workload);
installed it plus vcpkg (for OpenCV — glm/nlohmann_json/Catch2 already had a
`FetchContent` fallback, so they just needed a working compiler, not vcpkg).
Two Windows-toolchain-specific gotchas hit and filed in
`engineering-hygiene.md`: the VS Installer's `--passive` flag needs the
shell pre-elevated (fails silently, exit 5007, rather than prompting UAC),
and the workload finishing successfully doesn't put `cmake`/`cl.exe` on
`PATH` at all. New `Aurora-Input-Windows` repo (mirrors `Aurora-Input-Linux`'s
shape) built clean against Aurora core via vcpkg's toolchain file — first
proof the multi-repo `FetchContent`-sibling pattern holds on Windows too.

Wrote `WindowsGrabber` against `WindowsInputAnalysis.md`'s researched DXGI
shape, then — since this dev machine has a real interactive desktop, unlike
WSL2 for the Linux plugins — actually ran it against real hardware
immediately, rather than deferring verification. Two real bugs found this
way, both corrected in `WindowsInputAnalysis.md` and filed in the new
`Analysis/lessons/input.md`: (1) `AcquireNextFrame`'s non-blocking `0`ms
timeout, the shape recommended by the original research, starved forever on
empty placeholder frames on real hardware — fixed with a real `16`ms
timeout; (2) the research's claimed-HDR finding turned out to be a
misread placeholder-frame artifact, not confirmed real HDR content, and was
corrected rather than left overstated. Also confirmed live: a
Windows-enumerated "attached" monitor can be genuinely powered off yet read
back as valid all-black data, indistinguishable from real black content by
the API. **Result: `Aurora-Input-Windows` 1/1 automated test passing**
(`DummyGrabber`), plus a hidden/manual Catch2 case (`[manual]` tag) that
drove `WindowsGrabber` against the real desktop and printed real, sensible
captured color data — the first Windows capture verified end-to-end, not
just build-verified.

**`Aurora-App-Windows` built and confirmed working end-to-end against real
lights (2026-09-13), completing phase 2's demonstrable.** New repo, same
shape as `Aurora-App-Linux` (`Registry` copied verbatim — fully
platform-neutral; `main.cpp` adapted for `SetConsoleCtrlHandler` and
`%APPDATA%\Aurora` instead of `std::signal`/`$HOME/.config`). Two real,
Windows-specific link/portability gaps found and fixed while wiring it to
`Aurora-Output-Hue`: Mbed TLS's entropy source needs `bcrypt.lib` (plus
`ws2_32`/`crypt32`) on Windows, and `Aurora-Output-Hue`'s
`find_package(PkgConfig REQUIRED)` hard-failed outright (no pkg-config
binary at all on Windows, a step past the earlier Ubuntu `.pc`-file gap) —
generalized to `QUIET` + a `PkgConfig_FOUND` guard, portable improvement,
not Windows-only. Also added `Config::activeMonitorName` (a name, not an
index, resolved via new `Runtime::MonitorSelector`) so monitor choice is a
real persisted `Config` setting like `activeInputName` — the same growth
path a future setup UI would use, works unchanged for `X11Grabber` too
(confirmed by reading its `_initMonitorsList()`; `PipewireGrabber` has no
monitor list at all, Wayland's portal picks the screen itself, so it
harmlessly no-ops there). **Result: `Aurora-Input-Windows` 1/1,
`Aurora-App-Windows` 4/4, and (after clearing an unrelated stale-ACL
`build/` directory and a vcpkg-manifest-mode/classic-mode Catch2 ABI
collision from an IDE extension's auto-configure — neither a code issue)
Aurora core's own suite 26/26, all passing natively on Windows for the
first time**, not just via WSL2 or a plugin's `FetchContent`. Real run
against the actual bridge (credentials/zone map transcribed from
`Aurora_HueProfile0`, the same data already proven on the Ubuntu machine):
a real UDP socket to the bridge's DTLS port confirmed via `netstat`, and
user-confirmed live — dragging a window onto the configured (but physically
powered-off) monitor changed the real lights immediately. That last part
also sharpened the monitor-powered-off finding above: an off monitor isn't
inherently black, Windows keeps compositing real content to it regardless —
see `Analysis/lessons/input.md`'s follow-up note.

## Phase 1 — Refactor into three modules; Linux input + Hue output plugins

Pure restructuring, zero new features. **Demonstrable:** the restructured app
captures the Linux screen and drives real Hue lights exactly like huenicorn does
today — this is the regression check everything else builds on.

1. **Analysis pass first.** Three docs, each covering its section holistically
   before any code moves. **All three done:** `Analysis/ProcessingAnalysis.md`
   (the `Contracts` vs `Processing` split, three real bugs found during the
   read/port), `Analysis/HueOutputAnalysis.md` (the pure-vs-I/O split that
   scoped that pass, the `Contracts::Frame` naming correction, the
   SSL-verification-disabled constraint worth carrying forward carefully), and
   `Analysis/LinuxCaptureAnalysis.md` (why X11 ports now but Pipewire doesn't,
   a fourth bug found — `_divisors()`'s off-by-one — and the `IInput`
   refinement it drove). `FirstScan.md` already covers the interfaces at a
   high level; these go one level deeper, per section, right before that
   section's code is actually touched.

   **Existing tests — checked, not usable as-is.** huenicorn's `tests/` has no
   working automated test today: `TestImageProcessing` and `TestGrabber`
   (`tests/AddTests.cmake`, gated behind `BUILD_TESTS`, default `FALSE`) both
   reference source/header paths from before the `Core`/`Hue`/`Imaging`/`Platform`
   reorganization (e.g. `src/PlatformSelector.cpp`, which is now
   `src/Platform/Selector.cpp`) and call at least one signature that no longer
   exists (`getSubImage`'s old two-`glm::vec2`-corner form vs. today's
   `Imaging::UVs`) — neither compiles as-is. A third file,
   `tests/src/GamescopeGrabTest.cpp`, does use current APIs but isn't wired
   into any CMake target at all. All three are visual/manual smoke tests
   anyway (write PNGs to disk, log FPS/mean-color, run for a fixed duration) —
   there's no assertion framework in the dependency list at all. This means
   phase 1's "prove no regression" needs a **new** safety net, not a revived
   one:
   - Add a real test framework (Catch2 or doctest — light, `FetchContent`-able,
     matches how huenicorn already pulls in nlohmann_json/glm) as part of this
     phase.
   - **Pin `Processing`'s pure functions with golden-value tests** —
     `rescale`, `getSubImage`, `getDominantColor`/`Algorithms::mean` are all
     deterministic (no OS/display/network involved); `Color::toXYB()` turned
     out to belong in this bucket too but ends up tested alongside
     `Output/Hue/` instead, since it moved there (see step 4). **Done and
     passing** for the `Processing` half — 8/8 tests, see
     `core/tests/ProcessingTests.cpp` and the directory-layout note above.
   - **Capture and Hue-streaming stay manual**, by nature — they depend on a
     real display session and (for Hue) a real bridge, so they aren't
     something CI can assert on. Fix `GamescopeGrabTest.cpp`-style checks to
     compile and keep them as a documented manual runbook (run N frames, count
     non-black, log average FPS) rather than pretending they're automatable.
2. **Done.** Stood up `Aurora/core` as a new CMake project seeded from
   huenicorn's, not an edit of `huenicorn/` itself.
3. **Done.** Introduced `IInput` in Aurora core (generalized from `IGrabber`,
   refined with monitor selection + the pure divisor math — see
   `ModuleSplitPlan.md`), and started `Aurora-Input-Linux` as its own repo
   (repo-split decision, same doc). Ported and tested `DummyGrabber` and the
   session-dispatch decision logic (`SessionDispatch`); mechanically ported
   `X11Grabber` (builds, needs a real X11 session to manually verify
   capture). Mechanically ported `PipewireGrabber`/`XdgDesktopPortal` too —
   1091 lines of D-Bus/GLib glue, but this pass found two genuinely pure,
   testable pieces inside it (gamescope node matching, raw-buffer-to-
   `ImageData` conversion) that the first scoping pass hadn't surfaced.
   Builds cleanly against real `libpipewire`/`gio` dev packages; still needs
   a real Wayland session to manually verify capture — tracked in
   `LinuxCaptureAnalysis.md`.
4. **Done.** Introduced the `Processing` module (plus, as it turned out,
   `Contracts` underneath it — see `ModuleSplitPlan.md`): moved
   `ImageProcessing` into `Aurora::Processing`, and `Color`'s generic parts
   (`toNormalized()`/`brightness()`) plus `ImageData`/`UV`/`Interpolation`
   into `Aurora::Contracts`. Per the earlier gamma decision, `Color::toXYB()`
   was **not** ported here — see step 5, it landed in `Aurora-Output-Hue`
   instead, as a free function; `Color` in `Contracts` has no Hue-shaped
   method on it at all now, by construction, not just convention.
5. **Done.** Introduced `IOutput` in Aurora core (header-only interface
   target, no `Config*` param, later gaining `zoneIds()` — see
   `ModuleSplitPlan.md`/`RuntimeAnalysis.md`), and started
   `Aurora-Output-Hue` as its own repo (repo-split decision, same doc).
   Ported and tested `toXYB()`, `Channel`, `HuestreamHeader`/`HuestreamPayload`,
   `sanitizeBridgeAddress`, `Credentials`'s byte-conversion first (everything
   pure), then the full I/O layer once `Config`/`Runtime` existed:
   `HttpClient` (libcurl), `ApiTools`, `EntertainmentConfigurationSelector`,
   `DtlsClient`/`MbedTlsImpl` (Mbed TLS), `Streamer`, and finally
   `HueOutput : IOutput` itself — see `HueOutputAnalysis.md`'s staged
   follow-up pass. Genuine I/O still needs a live bridge to verify
   end-to-end, same category as `X11Grabber`.
6. **Done.** `Contracts::Frame`/`Zone` — the neutral Input→Processing and
   Processing→Output contract (renamed from the `Processing::Frame` this step
   originally described — see `ModuleSplitPlan.md`'s naming correction).
   Minimal v1 shape (zone id + linear color); positions/effects/detections
   aren't needed until phases 3 and 5.
7. **Done against fakes; `HueOutput` now exists too (step 5), so real
   plugins can be wired in next.** Built `Runtime::Orchestrator`, depending
   on both `IInput`/`IOutput`, tested with a `FakeInput`/`FakeOutput` pair
   standing in for `Input::Linux`/`Output::Hue` — see `RuntimeAnalysis.md`'s
   follow-up pass. What's left is a real `main()` (compile-time or
   config-time plugin selection) constructing real `X11Grabber`/`HueOutput`
   instances and driving `Orchestrator::update()` in an actual timed loop —
   not `Orchestrator` itself, which is unchanged by this.
8. **Done for `Processing`** — golden-value tests run on WSL2 Ubuntu, 8/8
   passing. The manual runbook against a real bridge stays blocked on
   `Input::Linux`/`Output::Hue` existing. Carry the setup/config REST server
   over as-is; it isn't Input/Processing/Output-specific, don't redesign it
   here.

## Phase 2 — Windows input plugin

Fills in `WindowsAdapter`'s `_createGrabber` stub (currently returns `nullptr`).

- **Lighter analysis pass than phase 1** — there's no existing script to port
  here (the stub just returns `nullptr`), so this is a short note
  (`Analysis/WindowsInputAnalysis.md`) on what `IInput` actually requires of an
  implementer plus DXGI Desktop Duplication's real API shape (frame
  acquisition, format, the resize/re-acquire lifecycle) verified against
  Microsoft's docs before coding against assumed behavior — not a full
  conversion-analysis doc since nothing's being converted.
- **Done.** Implemented `IInput` as `WindowsGrabber` using **DXGI Desktop
  Duplication**, built and hardware-verified — see the narrative paragraph
  above and `WindowsInputAnalysis.md`'s hardware-verified-pass section.
- Already fixed, not phase 2's doing: `ImageProcessing::Algorithms::mean()`
  already honors `PixelFormat` per-channel (done as part of phase 1's
  `ProcessingAnalysis.md` finding 1) — the stale claim that phase 2 would be
  the moment to fix it has been corrected in `WindowsInputAnalysis.md`.
- **Done.** The same app, built on Windows (`Aurora-App-Windows`), capturing
  the Windows desktop and driving real Hue lights through the unchanged
  `Output::Hue` plugin — confirmed live against the real bridge. See the
  narrative paragraph above.
- Confirmed real, not just a planning-stage concern (see
  `Analysis/lessons/input.md`): a non-blocking `AcquireNextFrame` poll can
  starve on placeholder frames forever, and a monitor Windows still lists as
  attached can be genuinely powered off with no API-level way to detect it.

## Phase 2.5 — Audio input & processing

Inserted between phases 2 and 3, not phase 6, because it's independent of
phases 3–5 (browser/WebXR/ISF) — it's a new `Input`+`Processing` track,
the same kind of foundational native work as phase 2, not something
gated on or by the browser output work. **Analysis pass already done,
extensively:** `Analysis/AudioAnalysis.md` — every decision below is
sourced from it rather than re-derived here.

**Demonstrable:** play music through whatever the user normally uses
(Spotify, browser, anything), watch real Hue lights bounce between a
vibrant complementary color pair on the beat, the pair itself slowly
rotating in hue over time, nudged by the track's own spectral content —
confirmed live against real hardware, same rigor as phase 2's real
end-to-end verification.

**In scope for this phase — live capture only** (provenance 3 in
`AudioAnalysis.md`'s breakdown), because it's the only provenance that
lets tuning happen by ear without also building audio playback:

1. **Interface layer — rename done, verified where buildable.**
   `IInput`→`IVideoInput` across Core, `Aurora-Input-Windows`/`-Linux`,
   both App repos' `Registry`/`main.cpp`, `MonitorSelector`/`Orchestrator`,
   and both `RuntimeTests.cpp`/`OrchestratorTests.cpp`/`RegistryTests.cpp`
   fixtures — a whole-tree grep confirms zero remaining code references.
   **Windows side rebuilt and retested clean:** Core 26/26, `Aurora-Input-Windows`
   1/1, `Aurora-App-Windows` 4/4, all still passing after the rename. Linux
   side (`Aurora-Input-Linux`, `Aurora-App-Linux`) mechanically renamed and
   grep-clean, but not build-verified in this session — no Linux toolchain
   here, same limitation as phase 1/2's Linux work; needs a real build on
   the Ubuntu machine to confirm. **Done, also Windows-verified:**
   `IAudioInput` (Core, wholly independent interface, no shared base) and
   `Contracts::AudioBuffer` (raw samples + sample rate + channel count).
2. **Core `AudioProcessing` module, mirroring `ImageProcessing`'s shape —
   done and Windows-verified except aubio itself.** New `AuroraAudioProcessing`
   Core target (separate from `AuroraProcessing` deliberately, same
   dependency-isolation reasoning as the plugin repo split — only
   audio-enabled consumers need it linked). `Contracts::AudioFeatures`,
   `Color::fromHSV`/`toHSV` (verified against the palette table's known
   values, not just round-tripped), and the full color model —
   `randomAnchorHue` (six named pairs), `updateDrift` (fixed-direction
   rotation, rate-bias centroid nudge that never reverses direction,
   verified directly), `updateBounce` (RockyRoad's shortest-arc damping
   formula, onset-strength-scaled swing with a verified dynamism floor,
   RMS-driven brightness with a verified never-fully-dark floor) — all as
   pure functions taking an `AudioEffectSettings` struct (the
   `Config`-parameterization decided earlier), per `AudioAnalysis.md`'s
   formulas. **Result: 38/38 core tests passing** (12 new `AudioProcessing`
   tests + the pre-existing 26), rebuilt clean against `Aurora-App-Windows`
   too (4/4 still passing) with no regressions.

   **Still open, deliberately not guessed at:** `extractFeatures`'s
   `onsetDetected`/`onsetStrength`/`spectralCentroid` are placeholders
   (always false/0) — `rms` is real, pure math, no dependency needed. aubio
   itself isn't wired in yet; its actual C API hasn't been verified in this
   pass (only its license/packaging/staleness, back in `AudioAnalysis.md`),
   and this project's own rule is to verify a library's real behavior
   before coding against assumed behavior — that verification pass is the
   next concrete step, not yet done.
3. **Live-capture plugins**, new CMake target in each existing repo (not
   a new repo — see `AudioAnalysis.md`'s repo/target-structure section):
   - `Aurora-Input-Windows` gains `AuroraInputWindowsAudio` — miniaudio-
     backed WASAPI loopback, new `AURORA_INPUT_WINDOWS_ENABLE_AUDIO`
     option.
   - `Aurora-Input-Linux` gains `AuroraInputLinuxAudio` — native
     pipewire-backed capture, reusing the `libpipewire-0.3` dependency
     already linked for `PipewireGrabber`, new
     `AURORA_INPUT_LINUX_ENABLE_AUDIO` option.
   - Both implement `IAudioInput`; each internally adapts its platform's
     push-driven callback model to the interface's pull-style read (the
     adaptation lives inside the plugin, not the interface — see
     `AudioAnalysis.md`'s push/pull note).
4. **Orchestration — done, Windows-verified.** `AudioOrchestrator` built as
   a separate class, no shared base with `Orchestrator` (same reasoning
   `IAudioInput`/`IVideoInput` already got no shared base — the two
   pipelines share almost no real steps beyond "send `Frame` to each
   `IOutput`"). `Orchestrator` itself is completely untouched. New
   `composeAudioFrame` (Runtime) broadcasts one color to every active zone,
   the audio sibling of `composeFrame`. Deliberately no `Smoother` pass —
   `updateBounce`'s own damping already serves that role; stacking a
   second, independently-tuned easing on top would fight it. Takes an
   explicit `dt` (unlike `Orchestrator::update()`), since drift/bounce are
   genuinely time-integrated. **Result: 42/42 core tests passing** (4 new
   `AudioOrchestrator` tests + the pre-existing 38), `Aurora-App-Windows`
   rebuilt clean too (4/4, no regressions).

   Validated against real VJ software, not just Aurora's own precedent:
   TouchDesigner keeps audio (CHOPs) and video (TOPs) as genuinely separate
   operator families that can't even wire directly together, and Resolume
   treats audio purely as a *modulator* of video parameters rather than a
   parallel output producer — see `AudioAnalysis.md`'s orchestration
   section.

   Takes an `AudioEffectSettings` struct in its constructor (the tunable
   constants — cold-start pair, `smoothTime`, dynamism floor, centroid
   `strength` — as parameters, not hardcoded) so a future settings UI needs
   zero changes to `AudioProcessing`/`AudioOrchestrator` themselves. **Not
   yet done:** the actual `Config` fields to populate that struct from
   don't exist yet — today's tests pass a default-constructed
   `AudioEffectSettings{}` directly. Wiring real `Config` fields is part of
   step 5's app-wiring work below, the same place `activeAudioInputName`
   needs deciding.
5. **App wiring.** Both App repos add a new `Registry` factory map for
   `IAudioInput` (mechanical — `Registry` already isn't polymorphic over
   one shared interface, see `AudioAnalysis.md`), gated by a new
   `AURORA_APP_ENABLE_*_AUDIO_INPUT` option. **Also open:** how `Config`
   picks between a video-mode run and an audio-mode run — reusing
   `activeInputName` against both factory maps, or a separate mode
   selector plus `activeAudioInputName` — not decided, worth resolving
   here rather than guessing now.
6. **Tests — done for everything not gated on aubio,** per step 2's
   result above: `extractFeatures`'s real `rms` path, `randomAnchorHue`,
   `updateDrift`, and `updateBounce` all covered with no real audio
   hardware at all, same spirit as `ImageProcessing`'s tests, done first as
   planned, before either plugin exists. `extractFeatures`'s onset/centroid
   paths need their own tests once aubio is actually wired in. Live capture
   itself stays a hidden/manual test per platform, same category as
   `WindowsGrabber`'s `[manual]` case — depends on a real audio session,
   not something CI can assert on.

**Explicitly deferred, not part of this phase's demonstrable:**
- **`AudioFile-Input`** (provenance 1) — resequenced to a later,
  lower-priority pass as a reproducible test fixture (libsndfile-backed,
  already verified in `AudioAnalysis.md`), not needed for the live-capture
  demonstrable above.
- **Video-embedded audio** (provenance 2) — needs a genuinely different
  joint-demux component, tied to phase 3's still-unscoped video-upload
  idea, not this phase.
- **Building an actual settings UI** — the `Config` fields/`AudioEffectSettings`
  struct from step 4 make the values UI-editable *when* a UI exists, but no
  UI is part of this phase. Unset `fixedAnchorHue` (random pick among the
  six pairs) stays the only exercised path until something actually writes
  to that field.
- Every numeric constant in `AudioAnalysis.md` marked as needing a
  listening test (`smoothTime`, the dynamism floor, centroid `strength`,
  vibrancy S/V) — starting points to tune during this phase's actual
  build, not values to treat as final before real playback exists to
  tune them against.

## Phase 3 — Three.js browser output plugin

A new Output target: a browser page showing the live video preview and a 3D
visualization of the effect/zone data reacting in real time — the "virtual
lights around a screen" preview, and the base scene phase 4 goes immersive with.

- **Not yet aligned on shape:** a video-file-upload idea (play a user's video
  through `Processing`, drive an output from it) is under discussion for
  this phase — see `Analysis/BrowserAnalysis.md` for the findings so far
  (native-decode vs. browser-decode fork, whether it needs to reach real
  bulbs). Recorded as context, not a scoped sub-task yet.
- **Analysis pass first:** `Analysis/HttpServerAnalysis.md` covering
  `Network::Http::Server` holistically (`HttpServer`/`HttpLibServerImpl` —
  how the existing setup-WebUI routes are wired, request/response lifecycle,
  what httplib actually supports for chunked responses) before adding anything
  to it — extending a shared server wrong risks the existing setup WebUI, not
  just the new endpoints.
- **Native side:** extend the existing httplib-based server (already present for
  the setup WebUI) with two endpoints, no new dependency:
  - a chunked MJPEG endpoint serving the already-downsampled preview frames
    (JPEG-encode the same small `ImageData` already computed for color
    sampling via OpenCV's `imencode` — already a dependency, no new capture or
    encode pipeline needed)
  - a Server-Sent Events endpoint pushing each tick's `Processing::Frame` as
    JSON
- New `Output::ThreeJS` module implements `IOutput`; `send()` forwards the
  `Frame` to connected SSE clients. Note this needs `Runtime` to hold a **list**
  of active outputs rather than the single `m_streamer` huenicorn has today —
  Hue and the browser preview run simultaneously, not one-or-the-other.
- **Browser side** (new `web/`): a Three.js page rendering the MJPEG preview as
  a plane/texture, subscribing to the SSE endpoint, and drawing each zone as a
  colored 3D element positioned by its UV on the video plane.
- **Demonstrable:** open a browser tab, see the captured screen playing back
  with virtual colored light indicators reacting live around it — driven by the
  exact same Processing ticks simultaneously driving real Hue bulbs.

## Phase 4 — Extend to WebXR (reference RockyRoad)

Same phase-3 scene, made viewable in a headset — reusing RockyRoad's
already-solved groundwork instead of rediscovering it.

- **Analysis pass first**, and this one doubles as the source for the next
  bullet: read
  [`RockyRoad/Analysis/lessons/engine/dev-environment.md`](../../RockyRoad/Analysis/lessons/engine/dev-environment.md)
  and
  [`xr-3d-rendering.md`](../../RockyRoad/Analysis/lessons/engine/xr-3d-rendering.md),
  and write `Analysis/RockyRoadXRAnalysis.md` covering RockyRoad's actual
  IWSDK/Scene3D/Camera3D scaffolding holistically (not just the lessons list —
  the working code itself: `v2/src/`'s engine layer) before bootstrapping
  `web/` from it. The Windows/Vite/IWSDK setup gotchas and the local-Z
  camera-fixed-HMD rendering pattern are already documented in those lessons
  files; no need to rediscover them.
- Bootstrap from RockyRoad's IWSDK setup
  ([`v2/ARCHITECTURE.md`](../../RockyRoad/v2/ARCHITECTURE.md)) rather than from
  scratch — "put 3D content in a WebXR headset via Vite + IWSDK" is generic
  scaffolding, not note-highway-specific, so it's a legitimate distillation
  target the same way ChartPlayer's engine layer was distilled into RockyRoad.
- **Shared-util-library candidates — flag, don't build.** If the analysis pass
  above turns up pieces of RockyRoad's custom XR logic (`Camera3D`, the
  local-Z helpers, IWSDK bootstrap glue) that are genuinely generic rather than
  note-highway-specific, note them in `Analysis/RockyRoadXRAnalysis.md` as
  candidates for a shared package between RockyRoad and Aurora. Don't extract
  one preemptively and don't go broad — capped to what's actually generic.
  **Pitch the specific candidates before doing any extraction work**, when
  phase 4 actually reaches this point, rather than deciding it here.
- **License note:** this reuses RockyRoad's engine scaffolding (GPLv3, itself
  carried from ChartPlayer) — already compatible with Aurora's own GPLv3
  (carried from huenicorn), just worth stating explicitly in `web/`'s own
  license note once one exists, the same way RockyRoad's README credits
  ChartPlayer.
- **Demonstrable:** put on a headset, see the same video-plane-plus-reactive-
  lights scene from phase 3, now immersive/stereo.

## Phase 5 — ISF processing connection

Wires ISF shaders in as the actual visual-effect layer for the browser/WebXR
output, per `OpenFormatsResearch.md`'s finding that ISF fits this target better
than any lighting-specific format.

- **Analysis pass first:** `Analysis/ISFRendererAnalysis.md` — read
  [`interactive-shader-format-js`](https://github.com/msfeldstein/interactive-shader-format-js)'s
  actual source/README (its real constructor/input-setting/draw API, which
  input types it actually supports vs. the full ISF spec) before designing the
  `Frame`-to-ISF mapping against it. Same rigor RockyRoad's
  `web-audio-worklets.md` lesson already flags: verify a third-party library's
  actual API before designing around assumed prior knowledge — this library is
  small and less actively maintained than the spec itself, so this check
  matters more here than for a major dependency.
- Use `interactive-shader-format-js` in `web/`'s Three.js scene, rather than
  writing an ISF/GLSL-JSON parser from scratch. Load a handful of existing open
  shaders from [isf.video](https://isf.video/)'s library as a starting effect
  set.
- Map `Processing::Frame` fields onto each loaded shader's declared inputs (a
  zone's color → an ISF `color` input, a zone's UV → a `point2D` input, etc.).
  This is the actual "processing connection" — it happens entirely browser-side
  on top of phase 3's existing SSE channel; no native/protocol changes needed.
- **Demonstrable:** swap which ISF shader is active and watch the XR scene's
  visual effect change, still driven by the same live color/zone data, with the
  native pipeline untouched.

## Stretch / explicitly deferred

- **Networking fork: WebSockets.** Once bandwidth or bidirectional control
  (WebXR pose back to the native core, browser-side effect selection persisted
  server-side) actually need it, replace phase 3's SSE+chunked-MJPEG channel
  with a WebSocket one (new dependency — e.g. uWebSockets, IXWebSocket, Boost.Beast).
  Not needed for phases 1–5 to work end to end. **This is also the fork
  where the open one-seam-vs-double-seam question in
  `DistributedArchitecturePlan.md` needs an actual answer** — pick it up
  again when this stretch goal gets picked up, not before.
- **Object detection (YOLO-style)** — designed in `OpenFormatsResearch.md`, not
  part of this pass; slots into `Processing` after phase 5.
- **Additional Output targets** (DMX/Art-Net/sACN, OPC/DDP) — deferred the same way.
- **Dynamic/hot-swappable plugin loading** — only revisit if compile-time module
  selection actually becomes a real pain point (e.g. wanting one binary to
  support many outputs without recompiling).
