# Build history: phases 1-2 (2026-09-13)

Moved out of ImplementationPlan.md — the plan keeps status, this file keeps the verification narrative. Beads: phase-1/phase-2 closed milestones.

---

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
