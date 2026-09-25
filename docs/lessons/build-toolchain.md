# Build toolchain

CMake, vcpkg, compiler toolchains, WSL2 build checkouts, dev dependencies. See [README.md](README.md) for filing rules.

---

## Check a vcpkg port's default features before installing -- they can pull in a much heavier dependency tree than expected
Tags: vcpkg, dependencies, windows
Applies-when: installing a vcpkg port without checking its default features

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

---

## `enable_testing()` must be called in the parent scope, before `add_subdirectory()`, not inside the test subdirectory itself
Tags: cmake, ctest
Applies-when: wiring CTest discovery into a new CMake project

CTest only wires a directory's `CTestTestfile.cmake` to descend into a
subdirectory's tests if testing was already enabled *before* that subdirectory
was added. Calling `enable_testing()` (via `include(CTest)`) inside
`tests/CMakeLists.txt` built the test binary fine, but `ctest --test-dir build`
reported "No tests were found!!!" — nothing told the top-level test file to
look inside `tests/` at all.

**Fix:** call `enable_testing()` in the parent `CMakeLists.txt`, immediately
before `add_subdirectory(tests)`, not inside the tests directory's own file.

---

---

## Don't build C++ on a Windows-mounted drive from inside WSL2
Tags: wsl2, drvfs, cmake, build-env
Applies-when: setting up a WSL2 build checkout or hitting transient FetchContent failures on a DrvFs mount

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

---

## A relative path baked into a build file assumes consistent directory casing across platforms
Tags: cmake, paths, windows-linux, siblings
Applies-when: adding a relative sibling-repo path to a CMakeLists file

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

---

## Nested `FetchContent`-ed CMake subprojects can collide on shared CACHE variable names
Tags: cmake, fetchcontent, cache-variables
Applies-when: adding a CMake option to a plugin repo that FetchContents core

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

---

## A distro dev package can lack the `.pc` file its own `find_package`/`pkg_check_modules` call assumes
Tags: cmake, pkg-config, linux, dependencies
Applies-when: adding a pkg_check_modules lookup for a distro dev package

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

---

## A `FetchContent_Declare(... URL ...)` needs `DOWNLOAD_EXTRACT_TIMESTAMP` explicitly, and an existing block having it wrong stays invisible until its fetch path actually runs
Tags: cmake, fetchcontent
Applies-when: adding a URL-based FetchContent_Declare (and auditing siblings)

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

---

## Installing Visual Studio's C++ workload doesn't put its own tools on PATH
Tags: windows, visual-studio, cmake, path
Applies-when: setting up MSVC/CMake on a Windows machine (cmake not found after install)

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

---

## A stray `vcpkg.json` silently switches CMake's vcpkg toolchain into manifest mode, which can resolve a different, ABI-incompatible compiler
Tags: vcpkg, cmake, manifest-mode, ide
Applies-when: confusing link/build errors after an IDE touched the project

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

---

## A prebuilt vcpkg binary can be ABI-incompatible with a very new Windows SDK/MSVC toolset, and binary caching survives a "fresh" reinstall
Tags: vcpkg, windows, abi, msvc
Applies-when: __std_* link errors after a toolchain or SDK change

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

---

## `npm install <newpkg>` in a directory with no `package.json` can silently delete packages a previous ad hoc install put there
Tags: npm, scratchpad, jsdom
Applies-when: installing scratchpad dev dependencies ad hoc

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

---

## Sibling repos mix CRLF and LF -- check before editing, verify content-only after
Tags: line-endings, editing, git
Applies-when: editing files across sibling repos

`Aurora/core` and `Aurora-App-Linux` sources are CRLF while
`app/windows/src/main.cpp` is LF, and every repo's `LICENSE` shows
as modified from CR-only churn. Exact-match editing fails on multi-line CRLF blocks (no match found), and a whole-file rewrite flips
every line's ending, burying the real change.

**Fix:** run `file` on a target before editing and keep added lines in the
file's own convention; verify with `git diff --ignore-cr-at-eol` so the
content diff shows only the intended lines. Where an editor can't match a
CRLF block (e.g. two textually-identical guards), use a byte-exact scripted
replacement with single-occurrence assertions, kept reviewable outside the
repo, and re-check the diff afterward.

---

---

## FetchContent dedups by dependency name, not against a manual add_subdirectory -- guard app-level fetches with NOT TARGET
Tags: cmake, fetchcontent, superbuild, monorepo
Applies-when: adding a root superbuild over FetchContent-based slice builds

Each slice pulls core/ via FetchContent_Declare(AuroraCore SOURCE_DIR ...), which dedups safely across slices by name. But the moment the root superbuild adds a plugin dir with add_subdirectory AND an app also fetches it by name, the same directory gets added twice and configure dies on duplicate targets -- FetchContent cannot see the manual add. The reverse order breaks identically.

**Fix:** in every consumer FetchContent block, fetch only under if(OPTION AND NOT TARGET <MainTarget>) and keep the target_link_libraries block on the option alone (the target exists down both paths). Verified live: root configure with app+plugin+core together, full build, 19/19 tests.
---

## One VERSION truth with a dev fallback for standalone configures
Tags: cmake, versioning
Applies-when: baking a project version into binaries built two ways

The app version lives once, on the superbuild project() -- but slices also configure standalone, where that variable doesn't exist. An unconditional define would bake empty (or collide with a second default define), so each app resolves _AURORA_VERSION behind if(DEFINED): superbuild truth when present, "dev" otherwise.

**Fix:** single set() in the superbuild project, single if/else at each consumer; never duplicate the literal, and never emit two defines for one macro.

---

---

## Derive minimum specs empirically — declared minimums lie by omission
Tags: cmake, linux, dependencies, versioning
Applies-when: stating a minimum toolchain version in a preset, README, or CMakeLists

The stated CMake floor for the Linux build was wrong three times running:
`3.19` (copied from the presets-file docs), then `3.21` (the actual floor
of presets format version 3), then `3.24` — the real one, found only by
configuring with the system CMake 3.22 and watching it die. Each earlier
number was a plausible-sounding declared minimum; none survived contact
with the oldest toolchain. Two separate gates hid behind the single number:
CMake 4 refuses distro `glm` configs declaring `cmake_minimum_required <
3.5` (fixed by pinning `CMAKE_POLICY_VERSION_MINIMUM: 3.5` in the preset's
`cacheVariables`), and `DOWNLOAD_EXTRACT_TIMESTAMP` in every
`FetchContent_Declare` only exists since 3.24 (policy CMP0135) — on 3.22 the
fetch step fails with a misleading "URL is a path" error that reads like a
broken dependency rather than a too-old CMake.

**Fix:** the floor (3.24) now lives once in the preset's
`cmakeMinimumRequired`, mirrored in the README, and was verified both ways:
3.22 fails, 4.4.3 configures clean. General principle: a minimum spec is a
claim about the oldest thing that works — prove it by running that oldest
thing, since each layer (file format, commands, options, policies) can
carry its own higher floor that no declared minimum mentions.

---

---

## A root superbuild configures slices in add_subdirectory order, so an app-level CACHE FORCE set can lose to an earlier slice
Tags: cmake, superbuild, cache-variables, fetchcontent
Applies-when: setting a fetched dependency's option from an app slice in a superbuild

Suppressing httplib's own install rules (`HTTPLIB_INSTALL OFF ... FORCE`) from `app/linux/CMakeLists.txt` changed nothing: the root superbuild adds `input/linux` before `app/linux`, and the earlier slice's `FetchContent_MakeAvailable(AuroraCore)` already populated httplib with the default ON -- the app-level set ran after the fetch it meant to configure, on every reconfigure, so order -- not caching -- defeated it. The top-level cache even showed OFF while the generated install scripts still shipped httplib's files.

**Fix:** put dependency toggles at the single point that owns the fetch (`core/CMakeLists.txt`, just above its own httplib block), never in a downstream consumer -- that covers slice, superbuild, and plugin configures regardless of `add_subdirectory` order. When an install tree contains files no `install()` call explains, suspect a fetched dep's own rules firing before your toggle ran, and check generation order, not just final cache values.

---

## A header beside CMakeLists.txt is invisible to quoted #include without an explicit include dir
Tags: cmake, include-path, windows, build-break
Applies-when: adding a new header next to a slice CMakeLists.txt that sources include

main.cpp's `#include "resource.h"` failed (MSVC C1083) though resource.h sat next to the slice CMakeLists -- quoted includes search only the includer's own dir plus target include dirs, and the exe target searched just the binary dir. Cost a full Windows build round-trip to learn.

**Fix:** add `${CMAKE_CURRENT_SOURCE_DIR}` to that target's include dirs with a comment (done for aurora-app-windows); anchor asset paths the same way so standalone-slice and superbuild configures agree.
---

## A bundle Info.plist's substitution variables must exist before configure_file(), and generated bundle resources need MACOSX_PACKAGE_LOCATION plus a real custom-command OUTPUT -- POST_BUILD is too late
Tags: cmake, macos, bundle, codesign
Applies-when: wrapping a CMake executable target as a real .app bundle (MACOSX_BUNDLE)

Converting `app/mac`'s `aurora-app-mac` to `add_executable(... MACOSX_BUNDLE ...)` (`Aurora-8mk.11`) needed the version string the bundle's Info.plist uses (`_AURORA_VERSION`) computed *before* the target/`configure_file()` call, not down where the rest of `target_compile_definitions` already computed it -- CMake variable scope doesn't retroactively populate a file `configure_file()`'d earlier in the script. Separately, a build-time-generated Resources file (the bundle icon, built from the existing Linux tray icon set via a shell script, not committed as a binary) only lands inside the bundle if it's both (a) an `add_custom_command(OUTPUT ...)` with a real output path -- not a `POST_BUILD` step, which runs after CMake's own bundle-resource-copy machinery already ran -- and (b) listed as one of the executable target's own sources with `MACOSX_PACKAGE_LOCATION "Resources"` set via `set_source_files_properties()`. CMake's bundle packaging only copies files that are target sources carrying that property; it doesn't pick up files merely present in the build directory.

**Fix:** order matters: determine any Info.plist-consumed variables first, `configure_file()` the plist, generate bundle resources via `add_custom_command(OUTPUT ...)`, mark each with `MACOSX_PACKAGE_LOCATION`, then list them all as `add_executable` sources alongside the real source files. Ad-hoc `codesign` is the one step that correctly stays `POST_BUILD`, since it needs the fully-assembled bundle as input, not a resource CMake needs to place inside it.
---

## Without cmake, flags.make + link.txt are a complete build record for recompiling and relinking a single TU
Tags: build, cmake, recovery, linking
Applies-when: rebuilding after a toolchain loss (or on a machine without cmake) with a warm build dir

With no cmake binary available, `build/<preset>/app/linux/CMakeFiles/aurora-app-linux.dir/flags.make` supplied the exact defines/includes and `link.txt` the exact link line. One changed `main.cpp` recompiled and relinked cleanly against the prebuilt static libs. Two catches: the stale `libAuroraRuntime.a` predated a new TU, so the link failed on the first missing symbol -- recompiled the two changed sources and refreshed the archive with `ar r` (backup first); and archive member dates are normalized (all 1969), so dates can't identify staleness -- the linker error list is the oracle, iterate on it. Use absolute `-o` paths: a relative one combined with a failed link cost the only existing binary.
