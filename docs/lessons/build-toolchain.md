# Build toolchain

Id: lesson-build-toolchain

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
this exact `/mnt/d` checkout (steps 11, 14, 15, 16 of `archive/WebUI_Design_1stPass.md` all
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
package tree, chosen deliberately — see [[windows-input-analysis]]). A
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
repo, and re-check the diff afterward. And stage with plain `git add`:
`git add --renormalize` only touches tracked files, so brand-new files are
silently skipped (Aurora-ifkn.2 committed without its three new files; a
--dry-run prints nothing for untracked paths, which is the tell).
Stash-specific variant (Aurora-q9l1, 2026-10-07): with `* text=auto`,
`git stash` normalizes CRLF working copies to LF in the stash blob, and
`git stash pop` on Linux checks out LF -- three app mains silently flipped
LF-only while their content diffs stayed minimal, so the diff alone could
not catch it. Repaired by re-adding CR and re-checking `git diff --stat`.
Rule: after any stash pop touching CRLF files, check byte-level endings as
well as the diff, not the diff alone.
Same-repo variant (Aurora-ifkn.3, 2026-10-08): after `* text=auto eol=lf`
landed, worktree files can still carry CRLF (checked out before the rule)
while `git status` reports clean -- normalization hides them from git but
not from exact-match edit tools, which fail with no match found. `file`
(or `cat -A`) is the check, never `git status`. `sed -i 's/\r$//'` back to
LF is git-invisible when the stored blob is already LF (verify with
`git diff --stat`: empty), so normalize-then-edit instead of fighting the
match.

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

With no cmake binary available, `build/<preset>/app/linux/CMakeFiles/aurora-app-linux.dir/flags.make` supplied the exact defines/includes and `link.txt` the exact link line. One changed `main.cpp` recompiled and relinked cleanly against the prebuilt static libs. Two catches: the stale `libAuroraRuntime.a` predated a new TU, so the link failed on the first missing symbol -- recompiled the two changed sources and refreshed the archive with `ar r` (backup first); and archive member dates are normalized (all 1969), so dates can't identify staleness -- the linker error list is the oracle, iterate on it. Use absolute `-o` paths: a relative one combined with a failed link cost the only existing binary. Before the manual path, check for a pip cmake (`.venv/bin/cmake`, `python3 -c 'import cmake'`) -- this repo's venv ships cmake 4.4.3, which configures and builds normally.

---

## `qlmanage -t` is a Finder-preview thumbnailer, not an icon compiler -- it flattens transparency onto white
Tags: build, mac, icons, assets, qlmanage
Applies-when: rasterizing an SVG/vector asset into an `.iconset`/`.icns` on macOS without adding a build dependency

`app/mac/make_icns.sh` rasterized `docs/README/Logo_Square.svg` at every `.iconset` size via `qlmanage -t` -- chosen specifically to avoid a real SVG-rasterizer dependency (Inkscape/librsvg/etc), since `qlmanage` ships with every Mac. The resulting `.icns` had an opaque white background instead of transparency. Extracting the built `.icns` back into PNGs (`iconutil -c iconset -o <dir> Foo.icns`) and comparing against the source confirmed it: `qlmanage` is a Finder-preview-thumbnail generator, and flattens onto white the same way a document preview would, not a faithful vector rasterizer. A second, initially conflated problem (the mark looked off-center) turned out to be unrelated -- a real offset already baked into the source export, confirmed by comparing the raw source PNG directly and measuring its alpha-channel bounding box, not a `qlmanage` artifact at all.

**Fix:** `sips -z <h> <w> <src> --out <dst>` (built-in, zero new dependencies) is a plain bitmap resizer with none of `qlmanage`'s document-preview behavior -- correctly preserves alpha. It needs a real bitmap master at the largest size actually used (not the SVG), so only ever downsample from that master, never upsample, to stay crisp. General principle: when comparing a build tool's output against "what should have happened," extract and inspect the actual artifact (`iconutil -c iconset`, not just the `.icns`) before attributing a visual bug to the tool -- part of this bug was the tool, part was already in the source asset, and conflating them would have "fixed" the wrong thing first.

---

## A CACHE FORCE variable set right before a later FetchContent_MakeAvailable doesn't retroactively affect an earlier one in the same configure
Tags: cmake, fetchcontent, cache, audio
Applies-when: a top-level CMakeLists.txt fetches Core directly *and* fetches a plugin repo that also fetches Core, and a CACHE-FORCE'd option needs to reach Core's own `if()` gating

`app/mac/CMakeLists.txt` fetches `AuroraCore` directly (needed unconditionally for `Config`/`Orchestrator`/`Contracts`), then separately fetches `AuroraInputMac`, which *also* fetches its own copy of `AuroraCore` -- deduped by `FetchContent` since it's the same declared name, so only the first `FetchContent_MakeAvailable(AuroraCore)` call actually runs `add_subdirectory()` on it; the second is a no-op. Wiring up `Aurora-9z4.5`'s audio support, `input/mac/CMakeLists.txt` already correctly set `AURORA_CORE_ENABLE_AUDIO ${AURORA_INPUT_MAC_ENABLE_AUDIO} CACHE BOOL "" FORCE` right before *its* `FetchContent_MakeAvailable(AuroraCore)` call -- but that line runs too late to matter, because `app/mac/CMakeLists.txt`'s own earlier `set(AURORA_CORE_ENABLE_AUDIO FALSE CACHE BOOL "" FORCE)` had already forced it to `FALSE` and `core/CMakeLists.txt`'s `if(AURORA_CORE_ENABLE_AUDIO)` gate had already evaluated (and skipped `add_subdirectory(AudioProcessing)`) by the time input/mac's fetch even ran. The audio option silently had zero effect until this was traced -- input/mac configured and built fine, it just never actually got a real `AudioOrchestrator`/`AuroraAudioProcessing` to link against, and nothing in the configure output said so.

**Fix:** when a plugin repo's CMakeLists.txt sets a Core-level `CACHE FORCE` option to gate Core's own build, every *other* entry point that also fetches Core directly (an app repo's top-level CMakeLists, most directly) must set the exact same option to the exact same value *before its own* `FetchContent_MakeAvailable(AuroraCore)` call -- not rely on a later fetch's setting to reach back in time. `app/linux/CMakeLists.txt`'s `AURORA_APP_ENABLE_LINUX_AUDIO_INPUT` (set before its own Core fetch, then propagated forward to `AURORA_INPUT_LINUX_ENABLE_AUDIO` for the later input fetch) is the right shape to copy -- one option, set once, threaded through both fetch sites in the order they actually run, not two independent options that happen to agree by default.
---

## TEST_CASE names starting with `-` break CTest selection -- Catch2 parses them as options
Tags: testing, catch2, ctest, cmake
Applies-when: naming a Catch2 TEST_CASE, or debugging a ctest failure that reports `Unrecognised token` before any assertion runs

`catch_discover_tests` registers each case as `binary "<name>"`, passing the name back as an argv filter. A name starting with `--` (here: `--fake-hue flag detection`) makes Catch2 parse it as a CLI option instead of a test spec, so the case fails in the argument parser and its body never runs -- green test file, red suite, no product code involved.

**Fix:** never start a TEST_CASE name with `-`; describe the flag without its dashes (`fake-hue flag detection`). The `[tag]` still carries the grouping for `-R`/tag filters.

---

## Python's stdlib `http.server` queues only 5 pending connections -- module-heavy dev pages get `ERR_CONNECTION_RESET` on a slow Windows box
Tags: python, http-server, windows, es-modules, three-js, dev-serving
Applies-when: serving `web/demo/viz.html` (or any many-module ES page) with `python -m http.server`

`viz.html` pulls three.js (1.3 MB) plus ~10 more ES modules at once. On a slow laptop the browser opened the burst faster than the single-accept-loop server drained it; `socketserver.TCPServer.request_queue_size` defaults to 5, so Windows reset the overflow. Errors seen: Firefox `Loading failed for the module with source ".../three.module.js"` (a different file each reload, including on a brand-new port, so not a cache issue) and Edge `net::ERR_CONNECTION_RESET`. The server log showed `200` for every request and the bytes were identical to the file on disk (matching SHA-256) -- nothing server-side looked wrong, and `curl` fetched every file fine.

**Fix:** subclass `ThreadingHTTPServer` with `request_queue_size = 256` (and `daemon_threads = True`, `protocol_version = "HTTP/1.1"`), ~10 lines, serving the same directory. Kept outside the repo. General principle: a "200 in the log" plus a browser-side connection error means the failure is below HTTP -- suspect accept backlog before caches, MIME types or antivirus, and reproduce with a burst, not a single `curl`.

---

## Standalone `cmake -S core` on Windows doesn't find aubio through the vcpkg toolchain alone -- `core/vcpkg.json` silently switches vcpkg to manifest mode
Tags: cmake, vcpkg, aubio, windows, core-tests
Applies-when: configuring core's own suite on Windows outside the `windows-app` preset

With `aubio[core]:x64-windows` installed in vcpkg's classic tree and `-DCMAKE_TOOLCHAIN_FILE=.../vcpkg.cmake`, the `windows-app` preset configured fine, but `cmake -S core` failed at `AudioProcessing/CMakeLists.txt:16 find_package(Aubio CONFIG REQUIRED)` even with generator and triplet pinned. Root cause (2026-10-06, isolated): `core/vcpkg.json` is a manifest listing only `opencv4`, `glm`, `catch2`. Any vcpkg-toolchain configure of `core` as the top-level source dir sees that manifest and switches to manifest mode, which builds an isolated `vcpkg_installed/` tree from just those three packages and ignores the classic install entirely -- aubio, mbedtls, curl and miniaudio are invisible regardless of `Aubio_DIR`. `windows-app` never hits this because the repo root carries no `vcpkg.json`, so it stays in classic mode and sees the classic install directly.

**Fix:** pass `-DVCPKG_MANIFEST_MODE=OFF` on the standalone configure (`cmake -S core -B <dir> -G "Visual Studio 17 2022" -A x64 -DVCPKG_TARGET_TRIPLET=x64-windows -DVCPKG_MANIFEST_MODE=OFF -DCMAKE_TOOLCHAIN_FILE=<vcpkg>/scripts/buildsystems/vcpkg.cmake -DBUILD_TESTS=ON`); core then configures, builds and passes its full suite (171/171, matching Mac/Linux) with no explicit `*_DIR` overrides needed. An explicit `-DAubio_DIR=...` (the previous workaround here) also escapes manifest mode's isolation for that one package, but `-DVCPKG_MANIFEST_MODE=OFF` is the actual fix and covers the other classic-only packages too.

---

## Homebrew's plain `mbedtls` formula is v4 now -- a real API break, not just a version bump, and installing both side by side is worse than either alone
Tags: cmake, macos, homebrew, mbedtls, dependencies
Applies-when: building `output/hue` (or anything linking mbedTLS) on macOS via Homebrew

`output/hue`'s `MbedTlsImpl.hpp` is written against the classic API "stable
across 2.x and 3.x" (verified against 2.28.0 and 3.6.5) — the same
generation Ubuntu's `libmbedtls-dev` and vcpkg's Windows port ship.
Homebrew's plain `mbedtls` formula is now **4.2.0**, a major version that
restructured headers (e.g. `ctr_drbg.h` moved out of the public include
path into `mbedtls/private/`) and dropped manual RNG-configuration APIs
entirely (`mbedtls_ssl_conf_rng` no longer exists — mbedtls 4.x wires RNG
through PSA crypto internally instead). `brew install mbedtls@3` (3.6.7,
matching Ubuntu's `libmbedtls21` ABI) is the one to use — but installing
both side by side makes for a nastier failure than a clean "wrong
version" error: mbedtls@3 is keg-only, so it doesn't get symlinked into
`/opt/homebrew/include`. If the plain `mbedtls` (v4) formula is still
linked, `/opt/homebrew/include/mbedtls/` holds a partial set of v4
headers. Because that generic path sits earlier in the compiler's
`-isystem` search order than the explicit `mbedtls@3` include dir
pkg-config reports, `#include <mbedtls/ssl.h>` resolves to v4's copy
(found there) while `#include <mbedtls/ctr_drbg.h>` falls through to
v3.6.7 (missing from v4's public path) — a Frankenstein mix of two
incompatible header sets in one translation unit, surfacing as a
mystifying `use of undeclared identifier 'mbedtls_ssl_conf_rng'` instead
of a missing-file error.

**Fix:** `brew unlink mbedtls && brew link mbedtls@3 --force` so
`/opt/homebrew/include/mbedtls/` resolves consistently to 3.6.7.

---

## macOS has no `timeout` command -- bound a streaming check with the tool's own limit
Tags: macos, shell, tooling, sse, devstack
Applies-when: sampling a stream (SSE, `curl -N`, a long-running command) in a scripted check on a Mac

`timeout 5 curl -sN .../events` is a GNU coreutils habit; on stock macOS `timeout` doesn't exist (it's `gtimeout` only with Homebrew coreutils), so the command fails with "command not found" and the check silently samples nothing (Aurora-skv's live viz check). 

It bit again inside a mutation check (Aurora-d3ec): `timeout 60 ./tests ... | grep -E "FAILED|passed"` printed nothing because `timeout` was missing, and "no FAILED lines" reads as a surviving mutant, i.e. a test that does not catch it. Any scripted check whose success is "grep found nothing" needs a positive signal too (the `passed`/`test cases` line, or the exit code); `perl -e 'alarm 60; exec @ARGV' cmd` is the stock-macOS bound.

**Fix:** use the tool's own bound -- `curl -sN -m 4 http://127.0.0.1:18245/events | head -c 300` -- or `head -c`/`head -n` to end the pipe. Don't wrap `devstack.py up` in `timeout` either: it already waits for the first frame and exits.

---

## No `node` on this Mac -- VS Code's bundled Electron runs the web tests as Node
Tags: macos, node, web, testing, toolchain
Applies-when: running `web/ui` or `web-processing` `*.test.mjs` on a machine where `node` isn't installed

`node` isn't on PATH (no Homebrew/nvm/volta install), but VS Code ships Electron, which runs as plain Node with `ELECTRON_RUN_AS_NODE=1`: `ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" TuningFields.test.mjs` (Node v24 as of Aurora-ta5). Enough for the framework-free `*.test.mjs` scripts and `--check`; not a substitute for the real Node the graph editor's npm build will need (Aurora-lzj).

---

## The huenicorn fork needs Mbed TLS 3.x/4.x; this Linux box's 2.28 fails `DtlsClient.cpp` only -- verify per-TU with `make -k`
Tags: cmake, linux, mbedtls, huenicorn, upstream
Applies-when: building the `../huenicorn-fork` sibling checkout to verify an upstream fix on this Linux machine

huenicorn's `DtlsClient.cpp` has an `#error Unsupported Mbed TLS version`
guard for anything below 3.x (added in "Add distinct support for both MbedTLS
3.x and 4.x"). Ubuntu's `libmbedtls-dev` here is 2.28.8, which Aurora's own
`output/hue` still builds against fine, so the fork's full link always fails.
Every other translation unit compiles. System cmake is also absent; use the
Aurora `.venv`'s (see "Without cmake, flags.make + link.txt are a complete build record for recompiling and relinking a single TU").

**Fix:** configure into the session scratchpad with the venv cmake, then
`cmake --build <dir> -- -k` and check the touched `.o` files built without
warnings. For testable logic, compile a scratch driver directly against the
touched `.cpp` (e.g. `ImageProcessing.cpp` + OpenCV + `_deps/glm-src`)
rather than reviving the fork's stale `tests/`.


For code that needs the real DTLS path, build Mbed TLS itself into the
scratchpad instead (2026-10-08, `Aurora-h45.18`): the GitHub release tarballs
(`mbedtls-3.6.7.tar.bz2`, `mbedtls-4.2.0.tar.bz2`) configure with the venv
cmake (`-DENABLE_TESTING=OFF -DENABLE_PROGRAMS=OFF`) and install static libs
in a few minutes each. A 4.x driver must also link `libtfpsacrypto.a`.
`DtlsClient.cpp` then compiles against both, and a driver aimed at a dead UDP
port (`127.0.0.1:9`, `handshakeAttempts = 1`) fails `init()` in about a second,
fast enough to loop under LeakSanitizer.

---

## Vite doesn't empty an `outDir` outside its project root, so a build-time embed ships every stale hashed bundle
Tags: vite, npm, cmake, embed, build-output
Applies-when: building a Vite app into a CMake binary dir (or any outDir outside the Vite project) and consuming the whole directory

Found while planning Aurora-lzj (graph editor embedded via `embed_webroot.py`), reproduced in a scratchpad with Vite 8.3.2. With `--outDir ../outside`, Vite prints `outDir ... is not inside project root and will not be emptied` and keeps the old files. After one source edit the dir held both `index-BbZnYOS4.js` and `index-Be-uGZcT.js`. Anything that ingests the whole dir (an embed step, an install glob) grows with every rebuild, and the warning is easy to miss in a CMake build log.

**Fix:** pass `--emptyOutDir` (or `build.emptyOutDir: true`) whenever `outDir` is outside the project. If you'd rather not trust that, make the consumer read Vite's manifest instead of globbing the directory.

---

## App presets force core's `BUILD_TESTS` off, so a new core test never runs in an app build
Tags: cmake, testing, fetchcontent, ctest, windows
Applies-when: adding a core test meant to prove something on a platform you only build through an app preset

Each `app/*/CMakeLists.txt` sets `BUILD_TESTS FALSE CACHE BOOL "" FORCE` before fetching core, so `linux-app`, `windows-app` and `mac-app` build and run only the app's own tests. Aurora-lzj added `AuroraEmbedWebrootTests` to core to settle MSVC's concatenated-literal cap. The Windows app preset would never have compiled it, and a green `windows-app` run would have looked like proof.

**Fix:** verify core tests per platform with a standalone core configure (`cmake -S core -B build/core-tests`, then `ctest -R <name>`), and name that command in the bead. A test meant to gate an app-level behaviour belongs in the app's own test target instead.

---

## A configure-time glob can't track the output of a build step, so an embed of generated files must depend on that step's stamp
Tags: cmake, embed, glob, custom-command, npm
Applies-when: feeding another build step's output directory (npm/Vite, codegen) into `aurora_embed_webroot` or any `file(GLOB ... CONFIGURE_DEPENDS)` consumer

`aurora_embed_webroot` globs its input dir at configure time. The graph editor's Vite output (Aurora-lzj) doesn't exist then, and its hashed filenames change on every source edit, so the glob would see nothing or a stale list and the header would never regenerate. Found by reading the design, confirmed on Mac: touching an editor source reran vite and the embed only because of the wiring below.

**Fix:** have the producing `add_custom_command` write a stamp file (`cmake -E touch`), and pass that stamp to the embed step as an extra `DEPENDS` (the `aurora_embed_webroot` `DEPENDS` argument). Stamp the producer on its real inputs (lockfile for `npm ci`, a source glob plus config files for the build) so a C++-only edit reruns neither. Check all three directions by hand: C++ touch, source touch, no change.

---

## Anything added to Aurora.app must be staged before the ad-hoc signing step and survive `bundle-licenses.sh`'s wipe
Tags: cmake, macos, bundle, codesign, licenses
Applies-when: putting a new file into `Contents/Resources` (notices, assets) from the Mac app build

POST_BUILD commands on `aurora-app-mac` run in the order they were added, and the ad-hoc `codesign --deep` seals the bundle, so a copy added after it breaks the signature. Separately, `tools/mac/bundle-licenses.sh` (the identity-signed path) does `rm -rf Contents/Resources/Licenses` and regenerates it, so a file staged there by CMake disappears on that path. Aurora-lzj hit both while shipping the graph editor's npm notice; caught by reading, not by a failure.

**Fix:** add the copy `add_custom_command(TARGET ... POST_BUILD)` above the signing block in `app/mac/CMakeLists.txt`, and make `bundle-licenses.sh` stash and restore the staged file around its wipe. Verify with `codesign --verify --deep --strict` and by running the script against a fake bundle with an empty `bundled-dylibs.tsv`.

---

## `docs/check-links.py` is Python: run it as `python`, never `bash`
Tags: docs, check-links, windows, python
Applies-when: running the link checker from Windows or Git Bash

`bash docs/check-links.py` fails (`import: command not found`) because the file is a Python script (renamed from `.sh` in Aurora-lmn.6 after living most of its life under the wrong extension). It used to also die with `UnicodeDecodeError: 'charmap' codec` on Windows on the first non-ASCII doc, and regenerate `docs/_ids.md` with different line endings every run (~100 changed lines of pure whitespace) -- both fixed at the source in Aurora-lmn.5 (`encoding='utf-8'` on every `open()`, `newline=''` on the `_ids.md` write), so `PYTHONUTF8=1` is no longer needed and a rerun only diffs real content.

**Fix:** `python docs/check-links.py` (or `python3`) on any OS -- no env var. It now also runs automatically from `.beads/hooks/pre-commit` on any commit touching `docs/`, so this mostly matters for a manual mid-pass run.

---

## An unversioned `find_package(... QUIET)` takes any system copy, so a fetch-if-missing dep needs a version floor
Tags: cmake, find_package, fetchcontent, version
Applies-when: a fetch-if-missing dependency is chosen because the code needs a feature added in a specific release

`core/CMakeLists.txt` did `find_package(httplib QUIET)` and fetched 0.46.0 only when nothing was found. Any distro or vcpkg copy won, however old, and cpp-httplib older than 0.46 has no `httplib::ws::WebSocketClient`: the failure would show up as a compile error in HA code on some machines only (Aurora-dwo).

**Fix:** `find_package(httplib 0.46 QUIET)`; a too-old copy then counts as not found and the fetch runs. To test without installing old packages, write fake `<pkg>Config.cmake` and `<pkg>ConfigVersion.cmake` files under scratchpad prefixes and run a three-line project with `-DCMAKE_PREFIX_PATH` per version. Caveat: this only works if the package ships a version file; one that doesn't makes versioned `find_package` fail even for a good copy.

---

## A failed first configure of a Visual Studio build dir poisons it: retrying with `-G`/`-A` errors "generator platform does not match", and build/ctest then find nothing
Tags: cmake, windows, msvc, vcpkg, core, build-dir
Applies-when: configuring core standalone (or any slice) on Windows with `-DCMAKE_TOOLCHAIN_FILE`/`-DAubio_DIR`, especially after a configure that errored

`cmake -S core -B build/core-test` without the vcpkg toolchain fails at `find_package(OpenCV REQUIRED)` ("did not find one") -- but it still writes a cache with the default generator platform. Rerunning with `-G "Visual Studio 17 2022" -A x64` then stops with `generator platform: x64 Does not match the platform used previously`, and `cmake --build` (`MSB1009: ALL_BUILD.vcxproj does not exist`) and `ctest` (`No tests were found`) fail as a downstream effect, which reads like a second problem. The `windows-app` preset never shows the OpenCV failure because it resolves its own dependencies; core standalone does not.

**Fix:** delete the build dir and configure once with everything: `-G "Visual Studio 17 2022" -A x64 -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake -DAubio_DIR=C:/vcpkg/installed/x64-windows/share/aubio` (recipe in `docs/Building.md`). Treat "OpenCV not found" on Windows as a missing toolchain argument, not a missing install.

---

## `git sparse-checkout set` accepts a path that matches nothing without any error
Tags: git, sparse-checkout, tooling, external-repos
Applies-when: sparse-cloning a large reference repo (e.g. home-assistant/core) to read part of it

A sparse checkout of `home-assistant/core` was given
`homeassistant/components/config.` (trailing period from copying a
sentence). Git printed nothing and checked out nothing for it, so the
directory just wasn't there. `git sparse-checkout list` showed the typo.

**Fix:** after `set` or `add`, run `git sparse-checkout list` and `ls` the
expected directories. A missing directory means a wrong pattern, not an
empty upstream folder.

---

## A workflow that triggers only on `push` to `main` can't be tested before merging; open a PR, and a path filter that excludes the PR's files runs nothing and reports nothing
Tags: github-actions, ci, path-filters, pull-request
Applies-when: adding or debugging a GitHub Actions workflow, or wondering why one "didn't run" on a PR

Aurora's workflows had `push: branches: [main]` plus path filters, and the repo's CI sat unused for weeks ("CI does not run here") because no one pushed to `main` to find out. `pull_request` with no `branches:` filter fires for a PR into any base branch, and the workflow file is read from the PR's merge result, so editing the YAML and re-pushing is the fix-forward loop. Path filters apply per workflow: a PR touching only `windows.yml`, `mac.yml` and `web/demo/` ran those and web, not Linux (its paths never matched). A skipped workflow shows no check at all, which looks like Linux was removed.

**Fix:** test workflow changes on a draft PR, not on `main`. Before reading a missing check as a failure or a removal, compare the PR's changed files (`git diff --name-only <base>...HEAD`) with that workflow's `paths:`. A PR that should exercise every platform has to touch `core/**` or each workflow file. Keep `push` limited to `main` and let PRs do the testing. Minutes are free here because the repo is public (the billing page shows consumed usage fully offset by discounts); on a private repo Windows counts 2x and macOS 10x against the included minutes.

---

## On `windows-latest`, install OpenCV with choco and everything else with the runner's vcpkg; vcpkg `opencv4` alone is a ~40 minute build
Tags: github-actions, windows, vcpkg, choco, opencv, aubio
Applies-when: writing or debugging the Windows CI job, or a Windows configure fails on Aubio, curl, Mbed TLS or miniaudio

The first Windows CI run installed only OpenCV (choco) and failed at configure: `find_package(Aubio CONFIG)` found nothing. The `windows-app` preset needs curl, Mbed TLS, aubio and miniaudio too, which a developer machine already has from vcpkg. `windows-latest` ships vcpkg at `$env:VCPKG_INSTALLATION_ROOT`, so no clone or bootstrap is needed. vcpkg's default `opencv4` builds dnn/gapi/calib3d and takes about 40 minutes (`docs/Building.md`), so OpenCV stays on choco.

**Fix:** in `windows.yml`, `choco install opencv -y`; `vcpkg install curl mbedtls "aubio[core]" miniaudio` (`:x64-windows`, same `aubio[core]` as the docs); configure with `-DCMAKE_TOOLCHAIN_FILE=$env:VCPKG_INSTALLATION_ROOT/scripts/buildsystems/vcpkg.cmake -DOpenCV_DIR=C:/tools/opencv/build`; cache `VCPKG_DEFAULT_BINARY_CACHE` with `actions/cache` so only the first run builds the ports. The choco OpenCV `bin` directory is added to `GITHUB_PATH` because only `aurora-app-windows` gets its DLLs copied beside the exe; whether the core test executables needed that was not isolated (the job went green with it in place), so remove it only by testing the removal.

---

## A green CI `ctest` on an app preset does not run core's suite: check the test count and names, not the pass line
Tags: github-actions, ci, ctest, core, parity
Applies-when: a CI job is green and you are about to treat it as verifying core or Parity

`linux-app`, `windows-app` and `mac-app` build and test only the app, input and output slices (Windows: 70 tests). Core's tests, including `AuroraVideoParityTests` and `AuroraAudioParityTests`, are added only when `core/` is the top-level project (`core/CMakeLists.txt`, `BUILD_TESTS`). The first green Windows CI run showed "100% tests passed out of 70" and no Parity test; this was caught only by searching the log for "parity". The same trap was already filed (verify core tests with a standalone core configure) and was missed anyway.

**Fix:** each native workflow has a separate step configuring `core/` standalone (Windows also passes the toolchain, `OpenCV_DIR` and `Aubio_DIR`) and running `ctest`. After adding a check, find a named test in the log before relying on it. The Actions page's Ctrl+F does not search collapsed steps, so a "no match" there can be a false negative: open the step, use the run's "Search logs" box, or download the raw logs.

---

## Configuring core standalone with the vcpkg toolchain file switches on manifest mode and builds vcpkg's OpenCV, ignoring the OpenCV you pointed at
Tags: vcpkg, manifest-mode, opencv, core, ci, windows
Applies-when: a core standalone build (CI or local) with `-DCMAKE_TOOLCHAIN_FILE=…vcpkg.cmake` is slow, or its log shows protobuf/opencv4 ports building

`core/vcpkg.json` lists `opencv4`, `glm` and `catch2` (`cpp-httplib` was removed in Aurora-rtwh, see the two-copies entry below). A `cmake -S core` configure that passes the vcpkg toolchain file finds that manifest and installs it into `<build>/vcpkg_installed`, even with `-DOpenCV_DIR` set. The first Windows CI run of the core step sat 13+ minutes in "core tests" with protobuf configuring in the log (protobuf is an opencv4 dependency): a full vcpkg OpenCV build, the ~40 minute one in `docs/Building.md`. The app presets don't hit this because `/CMakeLists.txt` has no manifest.

**Fix:** pass `-DVCPKG_MANIFEST_MODE=OFF` so the toolchain stays in classic mode and uses the classic-installed ports (Aubio) plus choco OpenCV; core fetches glm and Catch2 (and always httplib) itself when they aren't found. If the log shows `vcpkg_installed` under the core build dir, manifest mode is on.

---

## Two copies of a header-only library on one build's include paths: a target can compile a different version than the library it links
Tags: httplib, odr, include-order, vcpkg, manifest-mode, fetchcontent, windows
Applies-when: a test or app that includes `<httplib.h>` (or any header-only dep) crashes inside the library's own inline code, only in one build dir, with a trivial handler

In a Windows core build with vcpkg manifest mode ON, `cpp-httplib` 0.58.0 lands in `vcpkg_installed/.../include`, `find_package(httplib 0.46)` still reports NOTFOUND, and core also fetches 0.46.0 into `_deps/httplib-src`. `AuroraNetwork` lists `httplib-src` first; `AuroraPipelineTests` (which links `AuroraRuntime`, and so OpenCV's vcpkg include dir) lists `vcpkg_installed` first. The test TU and `HttpServer.cpp` therefore compiled different httplib versions, and the first HTTP request segfaulted in `httplib::Server::process_request` before any handler ran (Aurora-rtwh). The compile definitions matched, so diffing `PreprocessorDefinitions` found nothing; the cue was the include-dir order in the `.vcxproj` plus `CPPHTTPLIB_VERSION` in each `httplib.h`. `AuroraNetworkTests` has the same code and passes only because its include order differs.

**Fixed in Aurora-rtwh:** `cpp-httplib` is no longer in `core/vcpkg.json`; core fetches its pinned httplib (cpp-httplib's version file only accepts the same minor, so `find_package(httplib 0.46)` never accepts a newer installed one). A manifest-mode configure now has one httplib copy and core passes 121/121. Don't add a header-only dep to the manifest if core also fetches it.

**General fix:** when an inline-library crash reproduces with a trivial handler, find every copy (`Get-ChildItem -Recurse -Filter httplib.h`, then compare the `AdditionalIncludeDirectories` order of each target and the version define). Prefer one copy per configure.

---

## Removing a dep from the vcpkg manifest doesn't clean an existing build dir: cached `find_package` paths and old objects keep the old dep
Tags: vcpkg, manifest-mode, cmake-cache, stale-build, brotli, httplib, windows
Applies-when: a fix that changes `vcpkg.json` (or any dependency source) "works" in a fresh tree but a long-lived build dir still crashes or fails to compile

After Aurora-rtwh dropped `cpp-httplib` from `core/vcpkg.json`, the pre-existing `build/core-test` still segfaulted `Monitors and reload routes answer from PipelineHost` (Aurora-3ono), while a fresh configure of the same commit passed 127/127. The old tree's CMake cache still held `Brotli_*` paths into the old `vcpkg_installed` (found as a transitive dep of httplib 0.58), so httplib was built with brotli support there and its objects were never rebuilt against the new setup. A `--clean-first` of just the httplib consumers exposed it as `Cannot open include file: 'brotli/decode.h'`. Fix: `cmake -U "Brotli_*" -U "*BROTLI*" -S core -B <dir>`, then a full build; 127/127. Faster: after changing the manifest, delete the build dir (its vcpkg_installed goes stale too).

**Cue:** a crash that a fresh tree doesn't have. Configure a throwaway tree before debugging code, and `grep` the old `CMakeCache.txt` for the removed dep. Fresh tree needs `-DAubio_DIR=C:/vcpkg/installed/x64-windows/share/aubio` on this box (aubio isn't in the manifest).

---

## Building against a distro `-dev` package without sudo: `apt-get download` + `dpkg -x`, then a rewritten `.pc`
Tags: linux, pkg-config, dependencies, sudo, apt
Applies-when: a configure needs a missing `-dev` package on a machine where you can't install packages

Aurora-2dz needed `libsecret-1-dev` on a box without sudo. The runtime `.so.0` was installed; only the headers, `.pc` and the unversioned `.so` link were missing.

**Fix:**
- `apt-get download libsecret-1-dev && dpkg -x *.deb root` (no root needed).
- Copy the `.pc`: set `prefix=` to the extracted `usr` and `libdir=` to a dir holding `libsecret-1.so -> /usr/lib/x86_64-linux-gnu/libsecret-1.so.0`.
- Drop `Requires.private` (libgcrypt, static-link only). pkg-config otherwise fails on it.
- Configure with `PKG_CONFIG_PATH=<that dir>`.

Local verification only; CI and real installs use the package.

---

## Two build trees sharing `FETCHCONTENT_BASE_DIR` clobber each other's dependency build dirs
Tags: cmake, fetchcontent, build-dir, catch2
Applies-when: making a second build tree and tempted to reuse the first tree's `_deps` to skip downloads

To skip re-fetching, a second core tree (Aurora-2dz, `core-tests-libsecret`) was configured with `-DFETCHCONTENT_BASE_DIR=build/core-tests/_deps`. That dir holds each dependency's *build* subdir (`catch2-build`) as well as its sources. The new tree regenerated those for itself, and the original tree then failed with `No rule to make target '_deps/catch2-build/.../depend'`. Its stale test binary still ran, which hid the breakage for one run.

**Fix:** give every build tree its own `_deps`. To share only sources, use `-DFETCHCONTENT_SOURCE_DIR_<NAME>=<path>` per dependency. To recover, reconfigure the damaged tree. Read the build step's own exit status, not just whether a test binary ran.

---

## A test that adds an unused static does not change the binary: the compiler drops it, so a "rebuilt" binary can be byte-identical
Tags: build, testing, dead-strip, codesign, cmake, macos
Applies-when: you need a rebuild that produces a *different* binary (code-signature, ACL or cache tests) and a trivial source edit leaves the cdhash unchanged

For Aurora-2dz's cross-rebuild Keychain check, appending `namespace { const char kMarker[] = "..."; }` to the test file rebuilt and relinked, but `cmp` showed the executable identical to the old one. Nothing referenced the constant, so it was optimized away and the ad-hoc signature (a hash of the bytes) did not change either, so a "rebuild prompt" could not appear. An `extern const char kMarker[] = "...";` at global scope has external linkage and is emitted.

**Fix:** after the edit, `cmp` the new binary against a saved copy (or compare `codesign -dvv` hashes) before treating it as a different build. Revert the marker afterwards (`git checkout <file>`) and rebuild.

---

## In zsh a word starting with `=` is replaced by a command path: `echo =======LOG` fails with "======LOG not found"
Tags: shell, zsh, macos, agent-workflow, quoting
Applies-when: a macOS shell one-liner prints section dividers like `echo =====X` or `echo ----` mixed with `=====` and aborts with "not found"

macOS's default shell is zsh. An unquoted word beginning with `=` is expanded to the full path of the named command (`=ls` becomes `/bin/ls`); if no such command exists, zsh stops the whole line with "<word> not found". A divider like `echo =======LOG` in a diagnostic one-liner therefore killed the command before the real work ran (Aurora-2dz). Linux bash doesn't do this, so a snippet that works on the Linux box can fail on the Mac.

**Fix:** quote dividers (`echo '======= LOG'`), or use `---` / `printf`. Run the line again; nothing had run.

---

## A codegen script's docstring can promise more than its regex parses: verify regen output before keeping it
Tags: build, codegen, regex, descriptors, webui
Applies-when: re-running a checked-in generator (`gen-descriptors.py`, or any regex-over-sources script) whose output is also checked in

`web/demo/vendor/webui/gen-descriptors.py` says to re-run it on any tooltip-copy change, and its `ENTRY_RE` only matches the `{"key", "type", "desc"}` literal form — not the `slider(...)`/`button(...)` helper forms most tables actually use. A trial regen while adding `app.pause`/`app.stop` (Aurora-5ipy.13.1) wrote 17 entries over the committed 27, silently deleting 12 shipped tooltips; nothing in the script warns. Reverted and hand-added the two keys instead (Aurora-ncdd tracks the real fix).

**Fix:** after any generator re-run, `git diff --stat` the output before keeping it — a pure-addition diff is the expectation for an additive change. Aurora-ncdd has landed (ENTRY_RE matches helper forms, CRLF-explicit write), so regen is byte-identical again and the hand-edit workaround is retired.

---

## A generated file checked in as CRLF will never regen byte-identical from a plain text-mode writer
Tags: build, codegen, line-endings, windows
Applies-when: a checked-in generated file must regen byte-identical and the writer runs on Linux while the file is CRLF

`web/demo/vendor/webui/descriptors.json` is CRLF in the working tree, but Python text-mode output writes LF -- so the fixed `gen-descriptors.py` (Aurora-ncdd) produced the right 29 entries yet `cmp` failed at byte 2. Same trap class as the lossy regex above: content-correct, byte-different, caught only by comparing bytes.

**Fix:** build the payload as text, then `open(out, 'wb')` with an explicit newline mapping and a comment saying CRLF is on purpose. Verify with `cmp` twice (content match, then determinism), not by eye.

---

## A slice build dir can hold a stale app binary: check freshness before live-testing
Tags: build, live-test, stale-binary, cmake, verification
Applies-when: live-testing an app binary from a tree with more than one build dir (superbuild `build/` vs slice dirs like `build/linux-app/`)

`build/linux-app/bin/Aurora` (Oct 4) predated Aurora-d3ec while `build/bin/Aurora` was fresh: the stale one booted fine and served the old `GET /api/state` shape with no `state`/`errors`, which reads exactly like a failed verification. Caught only by diffing the two binaries (`strings <bin> | grep <new marker>`, here `nothing_to_pause`).

**Fix:** before any live run, `ls -la` the candidate binaries and grep the fresh one for a symbol the change under test must contain. Rebuild the tree you test from (`cmake --build build`), and boot `build/bin/Aurora`, not a slice-local copy, unless you just rebuilt that slice.
