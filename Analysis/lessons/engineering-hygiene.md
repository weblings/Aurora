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
