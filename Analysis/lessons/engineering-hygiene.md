# Engineering hygiene

General software-design/build-tooling principles, each demonstrated via a real
issue hit in this repo. See [`README.md`](README.md) for how entries get routed
here vs. elsewhere.

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
