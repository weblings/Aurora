# Engineering hygiene

General software-design/build-tooling principles, each demonstrated via a real
issue hit in this repo. See [`README.md`](README.md) for how entries get routed
here vs. elsewhere.

---

## Check a vcpkg port's default features before installing -- they can pull in a much heavier dependency tree than expected

Installing `aubio:x64-windows` with its default features (`vcpkg install
aubio:x64-windows`) would have built the port's `tools` feature, which
pulls in `ffmpeg`/`libflac`/`libogg`/`libsndfile`/`libvorbis` -- a full
media-decode stack, directly contradicting the deliberate "Core stays
detection-only" dependency-isolation decision. Not obvious from the
package name or from `vcpkg search` -- only visible by reading the port's
`vcpkg.json` (features + which one is `"default": true`) or portfile
before installing.

**Fix:** installed with `aubio[core]` (default features explicitly
disabled) instead -- confirmed via timing alone that this mattered: 9.5s
vs. what would have been a from-source `ffmpeg` build. General principle:
check a port's declared features (`vcpkg.json`'s `"features"` block, or
the "provides CMake targets" summary vcpkg prints after install) before
accepting its defaults, especially for any dependency meant to stay
narrowly-scoped -- a port's default feature set is a real, undocumented
place for scope creep to sneak in silently.

---

## A process started from this Bash environment can report a different PID than Windows sees, and needs `/F` to stop from a redirected/backgrounded launch

Two related gotchas hit together while iterating on a live test run
(`aurora-app-windows.exe`, started via Bash's `&` with output redirected
to a file). First: `taskkill //F //PID $(cat pidfile)` reported "process
not found" even though the app was still visibly running -- Bash's `$!`
is the MSYS/Git-Bash-level PID, not necessarily the real Windows PID
`tasklist`/`netstat` report (confirmed: `$!` gave `1282`, the actual
process was `27344`). Second: even with the right PID, a plain `taskkill`
(no `/F`) on a process launched this way can fail with "can only be
terminated forcefully" -- redirecting output at launch means no real
console is attached, so there's no `CTRL_CLOSE_EVENT` channel for a
graceful stop to use.

**Fix:** find the real PID via `tasklist //FI "IMAGENAME eq <name>.exe"`
(by image name, not by trusting Bash's own job-control PID) when in doubt,
and default to `taskkill //F //IM <name>.exe` (by image name, forceful)
for anything started via a backgrounded/redirected launch from this
environment -- a graceful stop only reliably works for processes given a
real interactive console.

---

## A C library's own example code can use patterns that don't compile in C++, even when the header is C++-safe

Porting PipeWire's real `audio-capture.c`/`audio-src.c` example pattern
(verified against the actual source, not assumed) into `AudioGrabber.cpp`,
`&SPA_AUDIO_INFO_RAW_INIT(.format = SPA_AUDIO_FORMAT_F32)` failed to
compile: "taking address of rvalue". `SPA_AUDIO_INFO_RAW_INIT(...)` expands
to a C99 compound literal, which is an **lvalue** in C (address-of is
routine) but a **prvalue** in C++ (address-of is illegal without binding it
to a name first). The header itself compiles fine in both languages; only
this specific call-site pattern from the reference example doesn't
transfer as-is.

**Fix:** assign the macro's result to a named local (`spa_audio_info_raw
audioInfo = SPA_AUDIO_INFO_RAW_INIT(...);`), then pass `&audioInfo`.
General principle: verifying a C API's behavior against its own real
example code (the right instinct, and the one that caught this) doesn't
guarantee every *syntactic pattern* in that example ports unchanged into a
C++ translation unit -- compound-literal address-of is the specific
recurring offender, worth a second look whenever porting C example code
that takes the address of a macro-expanded initializer.

---

## `enable_testing()` must be called in the parent scope, before `add_subdirectory()`, not inside the test subdirectory itself

CTest only wires a directory's `CTestTestfile.cmake` to descend into a
subdirectory's tests if testing was already enabled *before* that subdirectory
was added. Calling `enable_testing()` (via `include(CTest)`) inside
`tests/CMakeLists.txt` built the test binary fine, but `ctest --test-dir build`
reported "No tests were found!!!" — nothing told the top-level test file to
look inside `tests/` at all.

**Fix:** call `enable_testing()` in the parent `CMakeLists.txt`, immediately
before `add_subdirectory(tests)`, not inside the tests directory's own file.

---

## Don't build C++ on a Windows-mounted drive from inside WSL2

Configuring CMake against a repo living on `/mnt/c` or `/mnt/d` (DrvFs) hit
real `configure_file: Operation not permitted` errors during compiler
detection — DrvFs doesn't support the POSIX file semantics CMake's probing
needs, unlike a native Linux filesystem.

**Fix:** clone/build from WSL's own filesystem (e.g. `~/aurora`), not the
Windows-mounted path. Keep the Windows-side repo as the source of truth and
mirror changed files across, rather than building in place on `/mnt/*`.

Same DrvFs root cause (it doesn't report real POSIX ownership) also trips
git's "dubious ownership" safe-directory check on `/mnt/*` repos — a false
positive, not a real multi-user trust issue; scope the exception to the exact
path (`git config --global --add safe.directory <path>`), never a wildcard.

**Update, later in the same project:** the original `configure_file` blocker
above hasn't recurred across many later WSL2 builds run directly against
this exact `/mnt/d` checkout (steps 11, 14, 15, 16 of `WebUI/WebUI_Design_1stPass.md` all
configured and built successfully in place, no file transfer needed) —
whatever combination of WSL2/DrvFs version this machine now runs no longer
hits that specific compiler-detection failure, or it was narrower than
first assumed. Building on `/mnt/d` directly is this project's normal,
working WSL2 verification path now, not something to keep avoiding on the
strength of the original finding above. A narrower, real, and still-live
risk does exist at a different step, though: `FetchContent`'s own extract-
and-rename sequence (`file(RENAME) ... because: Permission denied`, moving
a freshly-extracted dependency like `cpp-httplib` into its final `_deps/
*-src` path) failed three times in a row on one occasion, immediately after
a fresh `rm -rf` of the build directory each time, then succeeded on a
fourth attempt after a plain ~8s pause with no other change — consistent
with something (most plausibly Windows Defender's real-time scan)
transiently holding a lock on just-written files on the DrvFs mount, not a
permanent misconfiguration. **Fix:** on this specific failure (not the
general `configure_file` one above), delete the build directory and retry;
if it fails again immediately, wait several seconds before retrying rather
than concluding the environment is broken.

---

## `using namespace` doesn't make a sibling namespace's own name resolvable

Wrote `using namespace Aurora::Output::Hue;` in a test file, then referenced
`Contracts::UVCorner::TopLeft` expecting it to resolve — it didn't, compile
error. `using namespace` injects a namespace's *contents* into scope; it
doesn't make `Contracts` itself a name you can write, since `Aurora::Contracts`
was never brought in.

**Fix:** `using namespace Aurora::Contracts;` too (or fully qualify), then
drop the now-redundant `Contracts::` prefix at each call site.

**Recurred** in `Aurora-Input-Linux`'s test file right after this was first
fixed in `Aurora-Output-Hue`'s — knowing the lesson didn't stop it happening
again in the next plugin repo. Treat as a checklist item, not a one-off fix:
any new plugin test file that references `Contracts::` types needs `using
namespace Aurora::Contracts;` from the start, checked before the first build
attempt, not discovered by it.

---

## A relative path baked into a build file assumes consistent directory casing across platforms

`Aurora-Output-Hue`'s `CMakeLists.txt` resolves Aurora core via
`../Aurora/core` (relative `FetchContent` `SOURCE_DIR`). Windows is
case-insensitive, so authoring and testing this on Windows never surfaced a
problem — but the user's own earlier WSL clone of Aurora core was named
lowercase `~/aurora`, and Linux filesystems are case-sensitive, so the exact
same repo checked out with different casing would silently fail to resolve.

**Fix:** when reproducing a multi-repo sibling layout on Linux, match the
casing the relative path actually expects (or make the path configurable)
rather than assuming a repo layout that "just works" on Windows carries over.

---

## Nested `FetchContent`-ed CMake subprojects can collide on shared CACHE variable names

Aurora core's own `CMakeLists.txt` uses a `BUILD_TESTS` cache variable to gate
its test suite. A plugin repo (`Aurora-Output-Hue`) pulling Aurora core in via
`FetchContent` needs to suppress that inner test suite — but doing so by
setting a variable literally named `BUILD_TESTS` would also silently gate the
plugin's *own* tests if it reused the same name for its own toggle, since
CMake cache variables are process-global, not scoped per subproject.

**Fix:** avoided rather than hit — gave the plugin its own uniquely-prefixed
option (`AURORA_OUTPUT_HUE_BUILD_TESTS`) instead of reusing `BUILD_TESTS`, and
force-set the *inner* project's `BUILD_TESTS` to `FALSE` explicitly before
`FetchContent_MakeAvailable`. Worth a name-collision check like this whenever
a new plugin repo's `CMakeLists.txt` is being written against this pattern.

---

## A distro dev package can lack the `.pc` file its own `find_package`/`pkg_check_modules` call assumes

`Aurora-Output-Hue`'s `CMakeLists.txt` used `pkg_check_modules(MBEDTLS
REQUIRED ...)` for Mbed TLS, verified against Ubuntu's `libmbedtls-dev`
3.6.5 in the WSL2 dev environment. The first real-hardware machine had
2.28.0-1build1 instead — same headers/libs installed, but that package ships
no `mbedtls.pc`/`mbedx509.pc`/`mbedcrypto.pc` at all, so configure failed
outright with "package not found," not a version-mismatch error.

**Fix:** `pkg_check_modules(... QUIET ...)` first, then `find_library` as a
fallback wired into the same imported target name, rather than assuming
`REQUIRED` pkg-config coverage holds across every distro/version a dev
package might be installed as. Once configuring succeeded, the ported code
itself needed zero changes — it only used classic Mbed TLS API calls stable
across 2.x/3.x, so a comment claiming "only v3 is verified" was also stale
and worth correcting once actually tested against 2.x.

---

## An interface method's return value silently reused to build a persisted file path is part of that method's contract, case included

`IOutput::name()` reads like a display/logging string. `Runtime::Orchestrator`
actually uses it as data: `ZoneMapStore::load(output->name())` builds
`profiles/<name>.json` directly from it. `HueOutput::name()` returned
`"Hue"` (capitalized); the registry key registering it (`"hue"`) and the
repo's own README (`profiles/hue.json`) both used lowercase. On a
case-sensitive filesystem this didn't error anywhere — it silently created
and reconciled a *second*, always-empty `Hue.json` every run, and
`reconcileZoneMap`'s "new IDs default inactive" rule then made every real
zone inactive in that file, so streamed frames carried zero zone data. The
one file a human had hand-edited (`hue.json`) sat there completely
untouched, looking exactly like proof of nothing being wrong.

**Fix:** renamed the returned string to lowercase `"hue"`, matching the
registry key and README. General principle: when a method's contract isn't
fully described by its own docstring, check every call site for what it's
*actually* used to construct (a file path, a network key, a lookup) — those
uses impose real constraints (exact casing, allowed characters) that a purely
display-string reading of the method would miss entirely.

---

## When a run's own evidence contradicts the real-world outcome, distrust the evidence and re-derive it with narrow, independent probes

A full `aurora-app-linux` run printed clean output and reconciled its saved
zone map with no changes — read at the time as confirmation the Hue
transcription was correct. The physical lights never moved. The reconciled
file being read, though, wasn't the file the run actually used (see the
entry above) — the "confirmation" was accidentally re-reading a hand-written
file the app had never opened. Continuing to trust that evidence would have
stalled on the wrong layer indefinitely.

**Fix:** once a real run's outcome contradicts what its own logs/files
suggest, stop trusting those artifacts and build a small standalone probe
per suspected stage instead — a bare `HueOutput` fed explicit test colors (to
isolate REST+DTLS from capture), a bare `X11Grabber` printing frame means (to
isolate capture from everything downstream), `ss -u -a -n -p` against the
running process's PID (to check a real socket exists rather than trusting
`isConnected()` was even reachable). Each probe either confirms or rules out
one layer independently of the others' claims about themselves.

---

## Same capability with environment-selected variants is one plugin with backends, not several plugins

Nearly modeled X11 and Wayland/Pipewire capture as two separate plugin repos,
following the same reasoning that justified splitting Input from Output
(independent dependencies). The difference: a user doesn't *choose* between
X11 and Wayland the way they choose between a Linux input and a Hue output —
`SessionDispatch` already picks the right one automatically from facts about
the machine. Splitting them would force every consumer to fetch and wire
together two repos to get one coherent capability ("capture the Linux
screen, whatever session type") working at all.

**Fix:** the repo boundary tracks *independent, user-facing choices*
(Input vs. Output, one bulb brand vs. another) — not *implementation variants
of one capability that get selected automatically* (X11 vs. Wayland, and
likely later: which GPU API a renderer uses, which discovery protocol finds
a device). Those stay one repo with optional per-variant CMake components
(`AURORA_INPUT_LINUX_ENABLE_X11`/`_PIPEWIRE`), so their dependencies are still
independently skippable without fragmenting the capability itself.

---

## Not porting `Core::Logger` early is now costing real diagnostics, twice

Every ported I/O-heavy module so far (`X11Grabber`, now
`PipewireGrabber`/`XdgDesktopPortal`) has hit the same call: drop the
original's `Core::Logger::warn`/`error` calls since Aurora core has no
logger yet. Tolerable for X11's handful of call sites; `XdgDesktopPortal`
alone has a dozen, each marking a distinct D-Bus/portal failure mode that a
real user debugging a black-screen Wayland session will need. Silently
dropping all of them isn't free — it's deferred debuggability debt that
compounds with every I/O module ported before a logger exists.

**Fix:** not retroactively fixed here (still dropped, for consistency with
the modules already ported this way) — but this is now a second independent
occurrence, so treat "Aurora core needs a minimal logging interface" as
higher priority than its absence from the original 5-phase plan suggests,
worth doing before porting the next I/O-heavy module (Hue's `Streamer`/DTLS
layer) rather than after.

---

## A `FetchContent_Declare(... URL ...)` needs `DOWNLOAD_EXTRACT_TIMESTAMP` explicitly, and an existing block having it wrong stays invisible until its fetch path actually runs

Adding `nlohmann_json` via `FetchContent_Declare(... URL ...)` immediately
hit CMake's `CMP0135` dev warning (extracted-file timestamps default to the
archive's own, not extraction time — usually not what you want). Fixing it
prompted checking the project's other URL-based fetch (glm) for the same
issue — it had it too, just silently, because glm is apt-installed in this
dev environment so its `FetchContent` branch never executes here. It would
have surfaced the identical warning the moment someone built without
`libglm-dev` present (a fresh CI box, a contributor without it installed).

**Fix:** add `DOWNLOAD_EXTRACT_TIMESTAMP TRUE` to every `FetchContent_Declare`
that uses `URL` (not needed for `GIT_REPOSITORY`). When adding a new one,
also check sibling `FetchContent_Declare` blocks in the same file for the
same gap — a find-package-else-fetch pattern means the fetch branch can sit
unexercised (and unverified) on any given machine indefinitely.

---

## When splitting legacy state into "generic" vs. "plugin-specific," classify each field by where it's authored, not where its formula is applied

`Hue::Api::Channel` was correctly split into generic (`Runtime::ZoneMap`:
`uvs`/`active`) and Hue-specific (`Channel`: `gammaFactor`, `devices`)
pieces during the Runtime analysis pass. Gamma landed on the Hue-specific
side because its *consumption* is Hue-specific — the `2^(-gamma·2))`
formula, applied to an XYB brightness channel, is real Hue colorimetry.
But its *authorship* is identical to `uvs`/`active`: a value the user sets
once per zone, needing the exact same persist-and-reconcile lifecycle. The
analysis pass never checked that; it only surfaced while actually writing
`HueOutput::send()` and finding nowhere for the value to live, one port
later.

**Fix:** when sorting a field into "generic" vs. "specific to this plugin,"
ask where it's *set and persisted*, not just where its formula or
interpretation lives. A field can have fully generic authorship and
lifecycle while still being interpreted differently by every consumer
(exactly what happened once fixed — gamma's *value* moved to
`Contracts::Zone`, its *formula* stayed in `Aurora-Output-Hue`) — that's not
a contradiction, it's the correct split. Also worth noting: the module
dependency direction (`Runtime` → `Output`, one way only) is what forced
the fix through the passing contract (`Contracts::Frame`) rather than a
back-channel read from `IOutput` into `Runtime::ZoneMap` — that direction
would have been circular and simply wouldn't build.

---

## An installer's `--quiet`/`--passive` flag can mean "don't prompt," including the elevation prompt

Ran the Visual Studio installer's `modify` command from a normal (non-admin)
PowerShell window with `--passive` to add the C++ workload for the Windows
Input plugin. It didn't fail loudly or throw up a UAC dialog — it printed a
few telemetry lines, logged `Commands with --quiet or --passive should be run
elevated from the beginning`, and exited (code 5007) in under a second. No
installer process, no consent prompt, nothing left running — every
process/log-based check for "is it still working" came back empty, which
looked identical to "never started" until the log was actually read.

**Fix:** `--quiet`/`--passive` assume the invoking shell is *already*
elevated and won't trigger UAC themselves — open the terminal via "Run as
administrator" first, then run the command unchanged. More generally: an
unattended/non-interactive install flag can silently fold in "skip the
elevation prompt too," not just "skip the progress UI" — check for a
running process or a growing log file within the first few seconds of any
such command, rather than assuming a clean, fast exit means success.

---

## Installing Visual Studio's C++ workload doesn't put its own tools on PATH

Once the "Desktop development with C++" workload actually finished
installing (see the entry above), a plain `cmake --version` in a normal
PowerShell window still failed with "not recognized." The workload does
install its own CMake and MSVC — just not anywhere the shell can find them:
CMake lives under `Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin`,
and `cl.exe` is only on `PATH` inside a shell that's run `vcvars64.bat` (or
the "Developer" shortcuts Visual Studio adds to the Start menu) — neither
gets added to the normal user/system `PATH`. Looked identical to the
install having silently failed a second time.

**Fix:** for CMake, either add that bundled `bin` directory to `PATH`
(session-scoped is enough) or invoke it by full path. For the compiler,
skip `vcvars64.bat` entirely by configuring with CMake's Visual Studio
generator (`-G "Visual Studio 17 2022" -A x64`) instead of Ninja/Makefiles —
that generator locates MSVC through the Visual Studio installation itself,
so the invoking shell never needs `cl.exe` on `PATH` at all.

---

## A directory's ACLs can outlive a machine identity change, denying an account that looks like the same one

`Aurora/core/build/` (created earlier via a WSL2-mounted path) became
completely undeletable — every file inside denied, surviving a full reboot
(ruling out any process lock) and an IDE-extension uninstall. `Get-Acl`
showed why: the file's owning-domain SID prefix differed from the current
session's SID, despite both ending in the same relative ID (`-1001`, "first
regular user account") and both superficially resolving to the same
account name. Windows ACLs bind to the SID, not the display name — a
machine-identity change (reset, reimage, rename) leaves old ACEs granting
access to a SID nothing on the system maps to anymore, even though `whoami`
still prints what looks like the same account.

**Fix:** check for this specifically (`Get-Acl` on a denied file, compare
the SID prefix, not just the account name) before assuming a stubborn
"access denied" is a process lock — rebooting, closing apps, or uninstalling
extensions won't touch it. If `BUILTIN\Administrators`/`SYSTEM` still have a
valid grant (common, since those aren't tied to the per-install SID), an
elevated delete goes through directly with no ownership-repair step needed.

---

## A stray `vcpkg.json` silently switches CMake's vcpkg toolchain into manifest mode, which can resolve a different, ABI-incompatible compiler

Aurora core was set up for **classic** vcpkg mode (a shared, pre-installed
package tree, chosen deliberately — see `WindowsInputAnalysis.md`). A
`vcpkg.json` and `CMakePresets.json` appeared in `Aurora/core/` that no one
on this side created — almost certainly VS Code's CMake Tools extension
auto-configuring the folder using its own default preset. vcpkg's toolchain
script auto-enables **manifest mode** whenever a `vcpkg.json` sits next to
the CMake source root, silently overriding the classic-mode toolchain file
passed on the command line — no error, no warning it happened. That
manifest-mode install resolved a different, stale/incomplete Visual Studio
installation (a cancelled "VS Build Tools 2026" instance) than the complete
VS 2022 used for every other build, producing a Catch2 built against a
newer/different MSVC STL than the project's own code compiled against —
surfaced as `LNK2019: unresolved external symbol __std_find_last_not_ch_pos_1`
and similar, which reads exactly like a real code/link bug, not an
environment mismatch.

**Fix:** `-DVCPKG_MANIFEST_MODE=OFF` on the CMake configure line forces
classic mode regardless of a `vcpkg.json`'s presence. More generally: an
IDE extension can auto-configure a project using its own opinionated
defaults the moment it notices a `CMakeLists.txt`, independently of and
silently conflicting with a build setup already chosen deliberately for
that project — worth checking for stray generated config files (`vcpkg.json`,
`CMakePresets.json`, a `build/` full of unfamiliar cache entries) before
trusting a confusing link/build error is actually about the code.

---

## Two symptoms that look identical (colors clustered together on a wheel) can have completely different causes if produced by different code paths

A real-hardware vibrancy comparison against huenicorn led into an extended
investigation of Aurora's *video* zone-mapping pipeline (crop UV
coordinates, `getDominantColor`, subsample-then-crop ordering) diffed
line-by-line against huenicorn's equivalent — all to explain why every
light's dot landed clustered near the center of the Hue app's color wheel
instead of spread out and saturated. All of it matched huenicorn
byte-for-byte; none of it was the cause. The actual run being compared
turned out to be in **audio-reactive mode**, not screen-capture mode —
`AudioFrameCompositor::composeAudioFrame` intentionally broadcasts one
shared color to every zone (`AudioOrchestrator` has "no per-zone spatial
concept" by design, unlike video's `Orchestrator`), so lights clustering
together on the wheel was expected behavior for that mode, not a
zone-mapping bug at all — the video-pipeline diffing that produced it was a
real, separate, and genuinely correct finding (see `output.md`'s RGB-vs-XYB
entry), but it wasn't the explanation for *this* symptom.

**Fix:** nothing code-side — the desaturation itself was real and got fixed
(the RGB-vs-XYB colorspace bug, which affects both modes since they share
`HueOutput::send()`), but the "why are all the dots clustered together"
half of the observation needed no fix at all once which mode actually
produced it was confirmed. General principle: before diagnosing why an
observed symptom happened, confirm which code path actually produced the
run being looked at — two modes (or backends, or configs) sharing a
surface-level symptom don't necessarily share a mechanism, and diffing the
wrong one's implementation against a reference can consume real effort
without ever being wrong enough to notice, since every individual
comparison along the way can still come back genuinely clean.

---

## `AnalyserNode`'s frequency-domain getters return dB with internal smoothing baked in, not linear magnitude

Hit in `Aurora-Demo-Web` hand-rolling onset/RMS/spectral-centroid extraction
against the Web Audio API instead of aubio-via-WASM (see `AudioAnalysis.md`).
The ported math assumes linear magnitude, same as aubio's own spectrum data —
but `AnalyserNode.getFloatFrequencyData()`/`getByteFrequencyData()` don't
return that. Checked the real spec's own algorithm order, not assumed:
Blackman window → FFT → **smoothing over time** (`smoothingTimeConstant`,
default 0.8) → **convert to dB**. Feeding dB straight into linear-magnitude
math would have produced a nonsensical centroid, and the default smoothing
would have stacked with a hand-rolled onset detector's own rolling-average
history, blunting real transients below its detection threshold.

**Fix:** convert every bin back to linear via `10**(dB/20)` before use, and
explicitly set `smoothingTimeConstant = 0` on the `AnalyserNode` feeding any
hand-rolled temporal smoothing rather than trusting its default. General
principle: a convenience API can bake in several non-obvious processing
steps (windowing, temporal smoothing, unit conversion) before ever handing
back data — check what a "get me the data" method actually returns, not
just that it returns something shaped right.

---

## A synthetic test signal needs the same preprocessing the real pipeline applies, or a correct implementation can still fail its own test

Testing a hand-ported spectral-centroid function against a synthetic 1000Hz
sine wave (via a small hand-written DFT) initially failed by 3x — not a bug
in the centroid formula, but in the test's own DFT helper: a raw, unwindowed
sine wave over a fixed-length buffer has real spectral leakage whenever the
frequency isn't an exact integer number of cycles within that window,
smearing energy into high bins a magnitude-weighted centroid is highly
sensitive to. The real pipeline (`AnalyserNode`, and aubio's own phase
vocoder) never actually produces unwindowed spectra — both window before FFT.

**Fix:** applied the real Blackman-window coefficients (verified against the
spec, not guessed) to the test's synthetic signal before computing its DFT,
matching what the real pipeline actually hands the function under test.
General principle: a synthetic-signal test for DSP code needs to reproduce
the real pipeline's own preprocessing, not just the mathematically "pure"
input — otherwise a test failure (or worse, a false pass) can reflect the
test's own fidelity gap rather than the code actually being tested.

---

## Brightness lag reads as "boring"/unreactive far more than hue lag, when tuning a beat-reactive light response

Building `Aurora-Demo-Web`'s audio-reactive color model, A/B/C testing a
ported `updateDrift`/`updateBounce` against native's own listening-tuned
defaults (`bounceSmoothTime`/`brightnessSmoothTime` both 0.45s, tuned for
real Hue bulbs) showed the ported version reading as noticeably "boring"
on a screen. Uniformly speeding up every time constant wasn't the right
framing — the fix that actually mattered was specifically speeding up
`brightnessSmoothTime` (0.45s → 0.08s) while leaving hue's own smoothing
comparatively slow. A viewer's eye reads a delay between an audible hit
and a visual brightness punch far more readily than it reads a
slightly-lagging color/hue shift, which just naturally reads as smooth
ambient motion instead.

**Fix:** when a beat-reactive visual feels sluggish, check which signal's
damping is actually driving that impression before uniformly speeding up
every time constant — brightness/intensity is usually the more
perceptually load-bearing one for "does this look reactive," while hue can
stay slow without costing the same feeling of responsiveness. Relevant if
this tuning is ever backported to real bulbs (see `BrowserAnalysis.md`'s
A/C follow-up) — worth confirming the same asymmetry holds physically, not
just on a screen.

## A prebuilt vcpkg binary can be ABI-incompatible with a very new Windows SDK/MSVC toolset, and binary caching survives a "fresh" reinstall

Adding a new `core/Network` module and its Catch2 test (`AuroraNetworkTests`)
surfaced a link failure -- `Catch2d.lib` unresolved externals
(`__std_find_last_not_ch_pos_1`, `__std_search_1`,
`__std_regex_transform_primary_char`, and others), all MSVC STL vectorized
string-search helpers. Verified this wasn't caused by the new module by
building an untouched, pre-existing test target (`AuroraRuntimeTests`) fresh
in the same environment -- it failed identically. Root cause: this machine's
Windows SDK/MSVC toolset (10.0.26100.0, targeting 10.0.26200) is new enough
that vcpkg's cached community-built `Catch2d.lib` doesn't match the STL ABI
it now compiles against. Deleting the project's local
`build/vcpkg_installed` and reconfiguring didn't fix it -- vcpkg's binary
cache (`%LOCALAPPDATA%/vcpkg/archives`) re-served the same prebuilt artifact
in 44 seconds, nowhere near long enough for a genuine from-source rebuild of
Catch2 (let alone the rest of the manifest).

**Fix:** when a prebuilt vcpkg binary fails to link with `__std_*`-style
unresolved externals, suspect a Windows SDK/MSVC-toolset-vs-cached-binary ABI
mismatch before suspecting the new code that happened to trigger the first
rebuild -- confirm by building an untouched pre-existing target in the same
environment. Deleting a project's local `vcpkg_installed` does not force a
real rebuild by itself; binary caching will re-serve the same artifact unless
the cache itself is bypassed (`--binarysource=clear` or equivalent), and a
genuine from-source rebuild of a large manifest (this one includes opencv4)
is a real time cost, not a quick retry -- worth flagging to the user rather
than silently spending that time.

---

## A lesson entry naming a root cause is a diagnosis, not a fix -- the landmine stays live until something actually acts on it

Implementing `WebUI_Design_2ndPass.md` step 3 hit the exact same
`Catch2d.lib`/`__std_search_1`-style link failure the two entries above
already describe. Investigating from scratch (per this session's own
`prefer-code-confirmed-hypotheses-over-library-internals` habit) surfaced
a *third*, more specific root cause neither entry's fix actually resolved:
a stray "Visual Studio Build Tools 2026" instance, registered as a real
Windows product (`Program Files (x86)\...\Visual Studio\18\BuildTools`),
that vcpkg's own compiler auto-detection always preferred over the real
VS 2022 install -- confirmed by `dumpbin`-scanning VS 2022's own toolset
libs (the missing symbols exist nowhere in them) and its own headers
(nothing references `__std_search_1` either), then confirming the stray
instance's headers do declare it. The entry just above already names this
exact instance ("a cancelled 'VS Build Tools 2026' instance") as the
*other* bug's root cause -- it had been correctly diagnosed once already,
written down, and then never actually uninstalled, so it kept causing new,
differently-shaped symptoms in later sessions.

**Fix:** when a lesson entry names a specific root cause (a stray install,
a leftover file, a bad config value), treat "diagnosed" and "fixed" as two
different states and check which one actually happened -- a past entry
describing a workaround around a root cause (not the removal of it) means
the landmine is still live and will resurface differently later. If the
root cause is a piece of state on disk (like this stray VS instance), the
actual fix is removing that state, not re-deriving a workaround each time
it bites.

---

## An env-var override "succeeding" (per a tool's own log message) doesn't prove it changed which binary actually got produced

Chasing the link failure above, `VCPKG_VISUAL_STUDIO_PATH` was set to
force vcpkg to use VS 2022's toolset instead of the stray VS 18 instance.
vcpkg's own output confirmed this -- `Compiler found: .../2022/Community/
.../14.37.32822/cl.exe` -- and the resulting `catch2` package installed
without error. The link still failed identically. The override changed
what vcpkg *printed* and used for its ABI-hash bookkeeping, but not which
compiler its internal port-build script actually invoked for the real
compile step (still the stray VS 18 instance, confirmed after the fact by
`dumpbin`-checking the produced `.lib` for the disputed symbols). A
tool's own "here's what I'm doing" log line is not independent
confirmation that an override took effect end-to-end -- it can be
correct about one internal step (hash computation) and silently wrong
about another (the actual build invocation) in the same run.

**Fix:** when an override appears to work per a tool's log output but the
downstream symptom is unchanged, verify the *artifact*, not the log --
inspect the actually-produced binary (`dumpbin`, `nm`, checking a
timestamp or embedded compiler version) rather than trusting a
success-shaped message from the step in between.

---

## A bare `std::thread` manually joined only at the tail of `main()` aborts the process on any earlier `return`

Wiring up the new `HttpServer`'s lifecycle in both app shells' `main()`
initially stored the server thread as a plain `std::optional<std::thread>`,
stopped and joined only in the last few lines of `main()`. That code never
ran on the pre-existing "no outputs available -- nothing to drive" early-return
path. `std::thread::~thread()` calls `std::terminate()` if the thread object
is destroyed while still joinable, so that path would have aborted the whole
process instead of exiting cleanly with status 1 -- invisible at compile time,
and invisible on the happy path too, since only the no-outputs branch ever
reached the unjoined destructor.

**Fix:** wrapped the thread in a small RAII class (`HttpServerThread`) whose
destructor unconditionally calls `stop()` then `join()`, so every exit path
(early returns, an exception caught by `main()`'s own `catch`, normal
completion) unwinds through it via ordinary C++ stack-unwinding rather than
relying on one manually-placed cleanup call at the end. General principle: a
resource whose safe teardown depends on a specific line of `main()` being
reached needs to be re-checked against every early-return path already in that
function, not just the one being actively edited -- and this class of bug
usually doesn't show up by compiling, only by actually exercising the
early-return branch at runtime.

---

## A static-file mount point can shadow a registered API route at the same path, and the library's own dispatch order decides who wins

Wiring `HttpServer::serveStaticFiles()` (Aurora-WebUI's static frontend) and
the pairing/capabilities API routes together for the first time, rather than
assume cpp-httplib dispatches registered handlers first, its real
`Server::routing()` source was read directly: for GET/HEAD requests,
`handle_file_request()` (the static mount) runs *before* `dispatch_request()`
against registered handlers, and wins outright if a matching file exists.
Safe today only because Aurora-WebUI's own files never collide with an
`/api/...` path -- nothing in the framework prevents a future static file
from silently shadowing a route with the same path, and a shadowed route
fails with no error, just a response that looks like a static file instead
of running the handler at all.

**Fix:** documented as a hard rule (never add a file under `api/` in
Aurora-WebUI) rather than an implicit assumption, in the repo's own README
where a future contributor adding WebUI files would actually see it. General
principle: whenever a static-file mount and a registered-route system share
one HTTP server, check the library's real dispatch order before assuming
routes take priority -- a silent shadow is much harder to notice than an
outright conflict error, since a request to a shadowed path still returns
*something*, not a failure.

---

## No headless-browser tool exists in this environment, but jsdom against real files (installed dev-only, outside the repo) exercises real DOM/JS behavior instead of relying on code review

Building Aurora-WebUI's app shell (`shell.js`'s `navigate()`/settings-modal
logic, `topBar.js`'s rendering) needed real verification, but no browser-
automation tool is available to this agent in this environment (no
Playwright/Puppeteer-equivalent). Node itself also isn't on this machine's
WSL2 `PATH` (only Windows' own install is), so the check runs from the
Windows side.

**Fix:** `npm install jsdom --no-save` in the session's scratchpad directory
(never the repo -- it's a test-only dependency, same relationship Catch2 has
to the C++ repos' shipped binaries) and load the real `index.html`/`.js`
files from disk into it via `pathToFileURL()`, with `global.document`/
`global.window` set from the `JSDOM` instance before importing any module
that references bare `document`. This exercised real behavior no amount of
reading the code would have proven on its own: settings-modal open/close via
direct calls *and* real scrim/close-button click events, `navigate()`'s
actual mount-then-unmount-previous ordering, and confirming a screen title is
rendered via `textContent` (escaped) rather than interpolated as markup.
Genuine visual/layout verification in an actual browser is still a real gap
this doesn't close -- worth remembering as still outstanding, not solved by
the jsdom pass.

---

## A live end-to-end test against a real endpoint needs a settle time sized to the system under test's own timeouts, not to how fast a mocked test resolves

A live (unmocked) test of `OutputConnectScreen`'s Autodetect button against
the actual running server failed a "button re-enabled" assertion after a
100ms wait -- the same wait that was plenty for every other jsdom test in
this build, all of which used a mocked `fetch` resolving on the same tick.
Root cause: `HttpClient.cpp`'s `sendHttpRequest` sets `CURLOPT_TIMEOUT` to a
flat 1 second for every outbound call, including the server-side proxy to
`discovery.meethue.com` -- a real internet round trip this specific request
makes that no mocked test path ever exercises. 100ms was never going to be
enough once a real 1-second-capped network call was actually in flight.

**Fix:** raised the live test's settle time to 2.5s, comfortably past the
known 1s server-side timeout. General principle: a live/E2E test's wait time
should be derived from the real system's own configured timeouts (grep for
them if unsure) plus margin, not copied from a mocked test's own near-instant
settle time -- the two kinds of test have fundamentally different real
latency floors, and a wait that's fine for one will flake or falsely fail on
the other.

---

## A library's own "register everything before X" contract can force a slow dependency's construction earlier than it used to happen, with a real latency cost only testing surfaces

Adding `/api/monitors` and `/api/reload` required both routes to capture a
`PipelineHost` by reference -- meaning the whole Input/Output/Orchestrator
pipeline now has to be built *before* `httpServer.bind()`, since
`HttpServer`'s own contract (documented in its header, from
`HttpServerAnalysis.md`'s original design) requires every route registered
before `bind()` is called; there's no add-a-route-after-bind path. Previously
the server bound and started listening immediately after `Config` loaded,
with pipeline construction (real DXGI monitor enumeration on Windows) coming
*after*, in parallel with the server already being reachable. Reasoning about
the code alone made this look like a harmless reordering. Polling
`/api/capabilities` every 500ms after process launch measured the real cost:
~1.5-2s before the WebUI became reachable at all, versus near-instant before.

**Fix:** not solved here -- accepted as a documented tradeoff (a
nullable-initial-pipeline design, with routes and the tick loop tolerating
"not ready yet", would close the gap but adds real edge-case surface for a
few seconds of startup latency on an already-slow-starting piece). General
principle: when a new route needs a reference to something built later than
routes used to need to exist, check whether the library's own "must register
before X" contract now forces that something to be built earlier than
before -- and measure the actual latency delta by testing (poll for
readiness), don't just reason that a reordering is "probably fine."

---

## Saving a "reset to auto" sentinel can get silently overwritten by the very reload that save triggers, before it's ever observed

Building the Tuning screen's `subsampleWidth` field ("0 = auto"), a live
`PUT /api/config` setting it to `0` returned `0` correctly in that same
response -- but a `GET /api/config` moments later already showed a concrete
number (`48`) again, not `0`. Root cause: every settings `PUT` funnels
through `onConfigChanged` into `PipelineHost::reload()`, which calls
`Pipeline::build()` fresh; while still in video mode, that rebuild's
`Orchestrator::init()` sees `subsampleWidth() == 0` and re-derives it from
the display immediately, then persists the derived value right back via its
own explicit `ConfigStore::save()` call -- all before the *next* `GET` ever
runs. The `PUT`'s own response wasn't wrong (it reflects state right after
the patch, before that reload's side effect lands); reasoning from that
response alone would have concluded "auto persists as `0`," which is false
the moment reload finishes. This is also a different "0/empty means auto"
contract than `Config::activeMonitorName`'s, which stays genuinely empty in
persisted config forever unless explicitly set -- two auto conventions in
the same app, resolving differently, easy to conflate.

**Fix:** not a bug -- `0` legitimately means "please re-derive," and it
does, correctly. Documented rather than papered over: a UI exposing a
"reset to auto" value needs to say so honestly (no claim that reopening the
screen will show `0` again) once the same request that saves it also
triggers a reconstruction that can immediately resolve and re-persist it.
General principle: when a value's own setter or the reload it triggers can
rewrite that same value again before anyone reads it back, verify the
*settled* state with a fresh read after the write's own side effects have
had a chance to run -- a write's own response body only proves what was
true at that instant, not what's true a moment later once its side effects
finish.

---

## Before copy-pasting a "had to duplicate this per-app" pattern onto the next similar route, re-check whether the constraint that forced it still applies

Step 11's `/api/monitors`/`/api/reload` routes had to live directly in each
app's own `main.cpp`, duplicated near-verbatim, because they capture
`PipelineHost`/`Registry` by reference -- both app-layer types core has no
dependency on. Building `/api/zones` next, the default move would have been
to duplicate its JSON-marshalling logic into both `main.cpp` files the same
way, following the established precedent. Checking first instead of
assuming: `ZoneMap`/`ZoneConfig`/`Contracts::UVs` are already core types
with zero dependency on `Registry`/`Pipeline` -- the actual constraint that
forced step 11's duplication (needing an app-layer type) simply doesn't
apply here. The route's JSON logic could be written once in
`core/Runtime/ZoneRoutes.cpp`, reached from either app through the same
generic-callback bridging `SettingsRoutes`' `onConfigChanged` already
established, with each app supplying only a couple of thin one-line
lambdas.

**Fix:** wrote it once in core instead of duplicating. General principle:
an established "we had to duplicate X because of constraint Y" pattern is a
fact about the *previous* case, not a rule to reapply automatically to the
next similar-looking one -- re-derive whether constraint Y genuinely holds
for the new code before reaching for the same workaround, since the
constraint (not the pattern) is the actual thing worth checking for reuse.

---

## Before routing a new mutation through the same reload machinery everything else uses, check whether the data it touches is already live in memory outside that machinery

Every settings write built in steps 11-13 (`Config`-backed) has to go
through a full `PipelineHost::reload()` -- confirmed there's no
settings-only update path, `Pipeline::build()` always runs fresh, tearing
down and reconstructing capture/output. Building zone edits next, the
default assumption would have been that this is simply how any live write
works here. It isn't, for this specific data: `ZoneMap` was never part of
`Config` -- `Orchestrator` already holds it as a live, mutable
`std::unordered_map` that `update()` reads directly every tick, entirely
outside the reload path. That made a direct in-place mutation (guarded by
the same `PipelineHost` mutex `tick()` already takes, no rebuild at all) not
just possible but clearly the right choice once checked: the Zone Mapping
screen's whole job is dragging a rect live while watching real lights react,
and a full pipeline rebuild per drag-frame (the only path a `Config` change
has) would make that interaction unusable.

**Fix:** gave zone edits their own direct-mutation path
(`Orchestrator::updateZone`) instead of funneling them through `Config`+
reload. General principle: "every other write here goes through reload" is
a fact about `Config`-backed data specifically, not a property of the whole
system -- before extending that path to a new kind of mutation, check
whether the data being changed is actually reachable some other way
already (already-live, already-mutable, already read directly by the code
that needs the new value) before assuming the established heavyweight path
is the only option.

---

## `npm install <newpkg>` in a directory with no `package.json` can silently delete packages a previous ad hoc install put there

The session scratchpad's `node_modules` had jsdom installed ad hoc (no
`package.json`, just `npm install jsdom --no-save` run once, the pattern
used throughout this whole project for test-only dependencies). Installing
Playwright the same way (`npm install playwright --no-save`) reported
"added 2 packages, and **removed 39 packages**" -- npm, with no manifest to
treat as the source of truth, resolved the directory's dependency tree from
scratch around the one new request and discarded everything jsdom needed
that wasn't also a dependency of Playwright. Installing jsdom back the same
way afterward silently evicted Playwright right back, for the identical
reason -- confirmed by watching it happen a second time in the opposite
direction before recognizing the pattern.

**Fix:** the moment a scratchpad needs more than one ad hoc dev dependency
at once, write a real (if minimal) `package.json` listing all of them
before running any more bare `npm install <pkg>` commands, then `npm
install` with no arguments to resolve the whole set together -- confirmed
this stopped the eviction (both packages present after). General
principle: `npm install` without a manifest isn't "add this on top of
whatever's already here" the way it feels the first time -- it's "resolve
a tree containing this," and an unmanaged `node_modules` has no record of
what else was supposed to survive that resolution.

---

## A per-step build-log entry optimized for individual completeness can make the whole document unreadable, without any single edit being wrong

Writing `WebUI/WebUI_Design_1stPass.md`'s 19-step build order, each step's writeup was
judged against "is every claim in this entry accurate and well-supported"
-- real bugs found, every jsdom/live verification performed, every
doc-internal inconsistency resolved, all recorded in full. That's a
reasonable bar per entry, and each one really did hold up under it. But
starting around step 10, the doc's actual job had quietly shifted from
*planning prose* (bounded -- there's only so much to decide) to *build log
plus verification record* (unbounded -- no limit on how much verification
or how many findings a step can generate), and the same "record it
completely" instinct kept being applied to the new, much higher-volume
kind of entry. The document stopped being skimmable for the person
actually using it to track 19 steps of progress, and by the time a
cleanup was attempted, the doc had grown past the point where restructuring
it could be done safely and quickly in one pass -- it needed a slow,
careful manual pass instead.

**Fix:** a build-log-style doc needs a second, independent check beyond
"is this entry accurate" -- "does the document as a whole still let its
actual reader stay oriented." Keep each entry to what-was-built plus one
line of real findings and one line of verification; push exhaustive
verification detail (every test case, every resolved inconsistency,
explained in full) to an append-only log or changelog separate from the
doc someone is actually navigating by, not inline in the steering
document. Re-derive this per document rather than assuming individual
accuracy adds up to collective readability -- it doesn't, and the failure
is invisible from inside any single edit.

---

## Redirecting a live process's stdout to a file for later inspection can look identical to a crash, because console-attached and redirected stdout buffer differently

Debugging why a real double-click launch might be failing, ran the same
binary from this environment via `./aurora-app-windows.exe > log.txt 2>&1 &`
to capture what it prints. The log file came back completely empty --
looked exactly like the process had died before printing anything (the
same symptom a real crash produces). It hadn't: `tasklist` showed it still
running, and curling the port it should be serving got a real `200`. The
C runtime buffers stdout differently depending on what it's attached to --
line-buffered (flushes on every `\n`) when it's a real interactive
console, full/block-buffered (flushes only when the buffer fills or the
process exits) when redirected to a file or pipe. Every `std::cout` call
in this codebase uses a bare `"\n"`, not `std::endl` (which would force a
flush) -- correct and idiomatic for console output, but it means none of
that output reaches a redirected file until either a few KB accumulate or
the process actually exits.

**Fix:** confirmed the process was alive via `tasklist`/a real request to
its own port instead of trusting an empty redirected log file as proof of
an early exit. General principle: when redirecting a live, long-running
process's stdout to a file for this kind of live-testing (a pattern used
throughout this project), an empty or lagging log file is not evidence the
process crashed or hasn't reached that code yet -- verify liveness through
an independent channel (the process list, a real request) before
concluding from buffered output alone. `std::cerr` doesn't have this
problem (unit-buffered by default, flushes every write) — a discrepancy
between "cerr showed nothing" and "cout showed nothing" is itself a signal
worth noticing, not just retrying the same redirect.

---

## A write endpoint that requires a full object round-trip breaks the moment its paired read endpoint withholds part of that object from the client for security

`POST /api/hue/connection` originally required the entire `HueConnection`
(`bridgeAddress`/`username`/`clientkey`/`entertainmentConfigurationId`)
and overwrote unconditionally -- fine for the one call site that existed
when it was built (`OutputConnectScreen`'s `_finish()`, which had just
received all four from a fresh pairing). Adding a second, legitimate
caller that only wants to change `entertainmentConfigurationId` (Zone
Mapping's own picker) exposed a real structural problem: `GET
/api/hue/connection` deliberately withholds `username`/`clientkey` from
the frontend (a correct security choice, not an oversight -- the browser
never needs them once paired), which means no frontend code can ever
reconstruct a valid full body to resend. The full-overwrite write endpoint
and the field-withholding read endpoint were each independently correct
in isolation, but composed to make an entire legitimate class of caller
(anything that only wants to change one already-persisted field)
structurally impossible without either re-exposing the secret or
re-running the whole pairing flow just to change one dropdown.

**Fix:** made the POST merge-style (PATCH semantics: load the persisted
object first, overwrite only fields present in the request body), the
same convention `/api/config` and `/api/zones` already use elsewhere in
this same codebase. General principle: whenever a read endpoint
intentionally hides part of an object from the client (secrets, tokens,
anything write-only), check whether the paired write endpoint requires a
full round-trip of that same object -- if it does, no client can ever use
that write endpoint for anything less than a full re-supply of the hidden
fields, which is a design bug waiting for its first partial-update caller,
not a hypothetical.

---

## A fully ported, fully unit-tested function can still be dead code if nothing in the production call path actually calls it

`Aurora-Output-Hue`'s `ApiTools::matchDevices`, `parseEntertainmentConfigurationsChannels`,
and `loadDevices` were faithfully ported from huenicorn and covered by real
passing assertions in `ApiToolsTests.cpp` -- and never once called from
`loadEntertainmentConfigurations()`, the one function that actually reaches
the WebUI. `parseEntertainmentConfigurationShell` hardcoded every channel's
`devices` to `{}` at construction, so the real per-channel light-membership
data those three functions exist to compute was silently unreachable in the
live app the whole time, despite a green test suite implying the feature
existed and worked. Found only while investigating an unrelated request
(surfacing real light names in a new zone picker), not by anything in the
test suite itself -- nothing about a passing `ApiToolsTests.cpp` run could
have revealed that its subject was never invoked outside its own tests.

**Fix:** wired all three into `loadEntertainmentConfigurations()`, reusing
them rather than writing new parsing code from scratch. General principle:
a green test suite proves a function computes the right output for its own
given inputs, not that the function is reachable from anywhere real --
when auditing whether a ported feature is actually complete, grep for the
function's callers in production code, not just check that its own test
file passes.

---

## A reload that keeps the old instance alive until the new one is confirmed working can let the old instance's teardown undo the new instance's already-established state

`PipelineHost::reload()` builds an entirely new `Pipeline` -- including
calling every new output's `init()`, which for Hue means starting a real
bridge stream -- before ever tearing down the old one. That ordering is
deliberate and correct: a reload that fails to build shouldn't take down an
already-working pipeline. But nothing about it accounted for the old and
new pipelines' outputs potentially targeting the *same* external resource.
The old output's `shutdown()`, running only after the new one was already
live, unconditionally sent an authoritative "stop" for whatever bridge
entertainment configuration it used -- usually the exact same one the new
output had just started streaming to. `IOutput::shutdown()` gave the
outgoing instance no way to know a newer one had already superseded it for
that same resource.

**Fix:** extended `IOutput::shutdown()` to take an `isReplacement` flag --
`true` when a reload is tearing this instance down because a newer one
already exists, `false` on a real app exit -- so only the latter tells Hue
to actually stop the bridge-side stream. Deliberately fixed at the
interface, not inside Hue: the mechanism (two overlapping instance
lifetimes racing on one external resource) isn't Hue-specific, any output
plugin with its own session/connection concept could hit the identical
shape of bug. General principle: when a lifecycle pattern deliberately
overlaps two instances for safety (build-then-swap, not swap-then-build),
any teardown method on the outgoing instance needs a way to know it might
no longer be the authoritative owner of whatever external state it
manages -- an interface that can't express "you were replaced" invites
exactly this kind of stale-teardown race, and it only bites resources with
external, sticky state (a device session, a lock, a subscription), never
ones that are purely local memory.

---

## Confirming a crash is gone is not the same as confirming the intended user flow now works

Fresh-install repro: deleting `%APPDATA%\Aurora` and relaunching threw
before `httpServer.bind()` ever ran. First fix (making that throw
non-fatal, `PipelineHost` tolerating no `Pipeline`) was verified live --
the WebUI bound, served `/api/capabilities`, no crash -- and reported as
done. It wasn't: `/api/capabilities`'s `outputs` list came from
`registry.outputNames()`, which `registerOutputs()` only populates with
`"hue"` once credentials are *already* configured. `app.js`'s onboarding
gate and `DashboardScreen`'s Bridge row both read that same list as "is
Hue compiled into this build" -- so a real fresh install would see
`hasHue: false`, skip Output Connect entirely, and dead-end on a Dashboard
whose Bridge row was permanently disabled with no path to pairing at all.
The crash fix was necessary but tested at the wrong altitude: "does the
process survive" instead of "can a new user actually reach the thing they
need." Caught only because the user asked "what's the intended flow for a
new user then?" instead of accepting the crash fix as the whole answer.

**Fix:** decoupled the two meanings that had been conflated in one field --
`registerCapabilitiesRoute()` now reports `"hue"` whenever
`AURORA_OUTPUT_HUE_IO_AVAILABLE` is compiled in, regardless of
`registry.outputNames()`, matching that route's own documented contract
("compiled with," not "already paired"). General principle: after fixing a
crash, trace the *next* real user action through the code the same way a
JTBD pass would (see `web-ui.md`'s zone-mapping entry) -- a fix that only
stops the immediate error can still leave the surrounding flow a dead end,
and "no exception thrown" and "user can do the thing" are different claims.

---

## A domain field's default doubling as an implicit "never configured" signal is fragile, and a same-shape replacement can carry the identical flaw

`ZoneReconciler`'s `active{false}` default was quietly relied on elsewhere
(`app.js`'s `needsZoneMapping` check, see `web-ui.md`'s matching entry) as a
"this zone has never been touched" signal -- fragile the moment `active`'s
own default needed to change for an unrelated UX reason, which it did.
Fixing that, the first fix proposed here wasn't a structural correction --
it was swapping the same reliance from `active` onto `uvs` (checking
whether a zone's rect still equals its full-canvas default instead), a
same-shape replacement, not a fix: it breaks identically the moment `uvs`'s
own default ever needs to change for an unrelated reason, or the moment a
real, deliberate configuration legitimately matches that default (a
genuinely intended whole-screen zone, for instance). Caught only because
the user asked directly whether the same situation could recur.

**Fix:** added a dedicated presence field (`everConfigured`), decoupled
from any domain field's own value, matching the fix protobuf3 needed for
the identical problem with scalar fields -- a zero-value default can never
be distinguished from "never set" without a separate marker (which is why
wrapper types / explicit `optional` exist there). General principle: when a
bug is caused by overloading a meaningful field's default as a
presence/emptiness signal, don't just move that same overloading onto a
different field -- add a field whose only job is answering that question,
so no future change to any domain field's own default can ever break
presence detection again. When proposing a fix for this class of bug,
explicitly check whether the fix itself still overloads *some* field's
default as the signal, rather than assuming a different field is
automatically safer just for being different.

---

## Fixing the bug a symptom made visible can unmask a second, previously-dormant bug the first one had been silently absorbing

A short live-testing chain, each fix genuinely correct and independently
verified, still surfaced this pattern three times in a row.
`registerOutputs()` only ever registered `"hue"` once, at daemon startup;
fixing it to re-run after a live pairing made `Pipeline::build()`'s next
reload *succeed* for the first time during onboarding -- which is exactly
what let its own separate, pre-existing "default to `\"windows\"` video
input when nothing is configured yet" behavior actually run and start
driving real lights a full screen before the user had ever confirmed a
capture source. That default had been there all along; it was harmless
only because the earlier "no outputs available" bug had always thrown
first, so nothing downstream of it was ever reachable during onboarding.
Separately, `HueOutput::shutdown(isReplacement)` fixed a reload's old
instance from sending an authoritative bridge-side stop that killed the
new instance's already-started stream -- but a live retest after that
shipped still showed the same class of symptom (mode-switching not
actually reaching the bulb), and reading the code turned up a *second*,
independent call site (`EntertainmentConfigurationSelector`'s own
`disableStreaming()` on an already-active target) capable of sending the
exact same disruptive stop, never touched by the first fix because the
bug report that prompted it only pointed at the symptom's most visible
occurrence.

**Fix:** none of these needed reverting -- each fix was correct for the
bug it targeted. The general principle is procedural: after a fix makes a
previously-always-failing path start succeeding for the first time, treat
everything newly reachable through that path as unverified, not as "already
covered by existing tests/review," since nothing could have exercised it
before. And when a bug report describes a symptom a previous, already-
shipped fix was *supposed* to prevent, don't assume the report is stale or
mistaken -- grep for every other call site capable of producing the same
class of failure (the same disruptive action, the same silently-overloaded
default, the same never-registered state) before concluding the first fix
missed nothing.

---

## Diagnostic timers added independently across files each measure elapsed time from their own private starting point, and comparing them directly produces a real but meaningless number

Chasing a live "capture screen doesn't activate" report, timing logs were
added incrementally, one call site at a time, as each new suspect surfaced:
a `PUT /api/config` handler's own `steady_clock` start/end pair, then
separately a `Streamer`'s own `steady_clock` timestamp captured at its
construction. Comparing "handler took 1088ms total" against "first
`streamChannels()` call, 3191ms after `Streamer` construction" and
concluding the whole gap sat inside the handshake was wrong -- not because
either number was inaccurate, but because they're durations from two
different, uncoordinated zero-points (request start vs. mid-request object
construction), and nothing about reading them side by side reveals that.
The arithmetic needed to relate them correctly is exactly the kind of thing
easy to get wrong once several such private timers exist across different
files, since each one looks individually well-formed.

**Fix:** replaced every relative `steady_clock` timer with one shared
`_dbgMs()` helper (wall-clock milliseconds-since-epoch, duplicated per file
since these were throwaway diagnostics not worth a shared header) so every
log line lands on the same timeline and can be diffed directly, no mental
reconstruction required. General principle: the moment a second independent
relative timer joins a diagnostic session, stop trusting arithmetic between
them and switch to one shared clock (wall-clock timestamps on every line is
the simplest form) -- the risk isn't that any one timer lies, it's that
comparing two truthful timers with different starting points looks exactly
like a valid comparison until it's manually unpicked.

---

## A dev server with no `Cache-Control` header on any response can make a genuinely correct fix look like it didn't work, indistinguishable from a real bug

Fixing the "lands on an earlier onboarding screen after relaunch" report
took three real, independently-necessary code fixes -- and along the way,
two of the live retests that were supposed to confirm each fix instead
"failed," including one already (wrongly) marked done in a doc before that
retest came back. Both false failures had the same cause, only found once
suspected directly: `HttpServer` (`HttpLibServerImpl.hpp`) set no
`Cache-Control` header on any response at all. Aurora-WebUI's frontend is
served straight from disk with no bundler, so every edit ought to be live
on the next request -- but with no caching directive either way, a browser
is free to keep serving an already-cached copy of a `.js` file from before
the edit, and a relaunch of the *native app* does nothing to that cache,
since it's entirely client-side and outlives the server process. A hard
refresh mid-session visibly advanced past a screen a plain relaunch hadn't
moments earlier -- the same code, the same backend, the only difference
was which copy of the JS the browser happened to execute.

**Fix:** `set_post_routing_handler` now adds `Cache-Control: no-store` to
every response -- confirmed against cpp-httplib's real source
(`write_response_core`) that this hook fires for static file responses and
registered routes alike, not just one or the other. General principle: a
local, single-user dev server serving files straight from disk should
default to no caching at all, full stop -- the cost (re-fetching a handful
of small files on every navigation) is negligible, and the alternative is
a standing, silent source of "my fix isn't working" false alarms that look
exactly like real bugs and can burn real debugging time before anyone
thinks to suspect the browser's cache instead of the code.
