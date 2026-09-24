# macOS support

Status: exploratory — no code, CMake, or packaging changes yet, this is the
conversation-so-far writeup. Started from a new Mac (Apple Silicon, current
macOS) with no dev toolchain installed yet. No prior Mac exploration existed
in the repo before this: macOS only came up in passing in
[`GUILaunchUX.md`](GUILaunchUX.md#L26-L28) (tray reference, explicitly "not a
target"), [`FirstScan.md`](FirstScan.md) (Huenicorn's unimplemented
`MacOSAdapter.mm` stub), and [`OpenFormatsResearch.md`](OpenFormatsResearch.md)
(Syphon mentioned once as the macOS analog to Spout).

## Setup: getting the existing repo building on a new Mac

The root [`CMakeLists.txt`](../CMakeLists.txt#L23-L38) only auto-enables
slices when `CMAKE_SYSTEM_NAME` is `Linux` or `Windows` — on Darwin,
`cmake -S . -B build` configures a superbuild with nothing turned on, since
no `input/mac` or `app/mac` exists yet. Until that slice exists, the useful
thing to verify is that the toolchain and shared libraries (`core/`,
`output/hue/`) build standalone.

```sh
# Xcode CLT (confirm even if Xcode.app is already installed)
xcode-select --install

# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Deps: cmake (root pins 3.14 min, CMakePresets.json needs 3.24 — brew's is
# current), OpenCV (needed by every platform), curl (system one usually
# fine, but output/hue's find_package(CURL) is happiest with brew's),
# aubio (core/AudioProcessing hard-requires it on every non-Windows
# platform, not just Linux — see the pitfall below), mbedtls@3 (NOT the
# bare `mbedtls` formula — see the pitfall below) + pkg-config for
# output/hue's DTLS streamer
brew install cmake opencv curl aubio mbedtls@3 pkg-config

# mbedtls@3 is keg-only (brew's plain `mbedtls` formula is now v4, which
# this project doesn't support yet — see below), so point pkg-config at it
# and make it the active `mbedtls` on this machine:
export PKG_CONFIG_PATH="$(brew --prefix mbedtls@3)/lib/pkgconfig:$PKG_CONFIG_PATH"
brew link mbedtls@3 --force

# bd (this repo's task tracker, used instead of markdown TODOs)
brew install steveyegge/beads/bd
bd import   # pick up the tracked .beads/issues.jsonl
# On a truly fresh local DB, the very first `bd` command can fail with
# "issue_prefix config is missing" — a beads first-run quirk, not a repo
# config problem. Running any other bd command once (e.g. `bd list`) and
# then `bd import` again clears it.
```

Confirm the toolchain by building what already exists (no full app yet):

```sh
cmake -S core -B build-core-test && cmake --build build-core-test
ctest --test-dir build-core-test --output-on-failure

cmake -S output/hue -B build-hue && cmake --build build-hue
ctest --test-dir build-hue --output-on-failure
```

### Pitfall: Homebrew's `mbedtls` is now v4, and it's a real incompatibility

`output/hue`'s [`MbedTlsImpl.hpp`](../output/hue/src/MbedTlsImpl.hpp#L3-L6)
is written against the classic API "stable across 2.x and 3.x" (verified
against 2.28.0 and 3.6.5) — the same generation Ubuntu's `libmbedtls-dev`
and vcpkg's Windows port ship. Homebrew's plain `mbedtls` formula is now
**4.2.0**, a major version that restructured headers (e.g. `ctr_drbg.h`
moved out of the public include path into `mbedtls/private/`) and dropped
manual RNG-configuration APIs entirely (`mbedtls_ssl_conf_rng` no longer
exists — mbedtls 4.x wires RNG through PSA crypto internally instead).
`brew install mbedtls@3` (3.6.7, matching Ubuntu's `libmbedtls21` ABI) is
the one to use.

Installing both side by side makes for a nastier failure than a clean
"wrong version" error, and it's worth understanding if it comes up again:
mbedtls@3 is keg-only, so it doesn't get symlinked into `/opt/homebrew/include`.
If the plain `mbedtls` (v4) formula is still linked, `/opt/homebrew/include/mbedtls/`
holds a partial set of v4 headers. Because that generic path sits earlier
in the compiler's `-isystem` search order than the explicit `mbedtls@3`
include dir pkg-config reports, `#include <mbedtls/ssl.h>` resolves to
v4's copy (found there) while `#include <mbedtls/ctr_drbg.h>` falls through
to v3.6.7 (missing from v4's public path) — a Frankenstein mix of two
incompatible header sets in one translation unit, surfacing as a
mystifying `use of undeclared identifier 'mbedtls_ssl_conf_rng'` instead of
a missing-file error. Fix: `brew unlink mbedtls && brew link mbedtls@3 --force`
so `/opt/homebrew/include/mbedtls/` resolves consistently to 3.6.7.

## Scoping a Mac slice

Two tiers, from smallest to largest:

### Terminal-only (matches pre-1.0.2 Windows/Linux shape)

This is the recommended starting point — it skips the hardest and most
speculative piece (menu-bar tray integration), which the project's own
planning doc already treats as
[an enhancement, never a requirement](GUILaunchUX.md#L25-L28).

- **`input/mac/`** — implements the two contracts every platform plugin
  implements,
  [`IVideoInput`](../core/Input/include/Aurora/Input/IVideoInput.hpp) and
  [`IAudioInput`](../core/Input/include/Aurora/Input/IAudioInput.hpp):
  - *Video/monitor enumeration:* `ScreenCaptureKit` (the modern, sanctioned
    API, macOS 12.3+) for frame capture, `CGDisplay`/`NSScreen` for the
    `MonitorData` list. Needs Objective-C++ (`.mm`) files and a Screen
    Recording TCC permission prompt — the app must be signed (ad-hoc is
    fine locally) or the OS re-prompts every rebuild.
  - *Audio:* the genuinely hard new piece. Unlike Windows' WASAPI loopback,
    macOS has no built-in "capture what's playing" API for most of its
    history. Two candidate paths, not yet decided between:
    1. Core Audio **process taps** (`AudioHardwareCreateProcessTap`, macOS
       14.4+) — no kernel extension, but needs a separate "Audio Capture"
       TCC permission and a recent macOS.
    2. Ask users to install a virtual loopback driver (BlackHole), closer
       in spirit to how Linux leans on PipeWire monitor sources.
  - Mirrors `DummyGrabber`/`InputControlDescriptors` from the Linux/Windows
    slices for parity and testability.
- **`app/mac/`** — thin shell tying `core/` + `input/mac/` + `output/hue/`
  together, same shape as
  [`app/linux`](../app/linux/src/main.cpp) /
  [`app/windows`](../app/windows/src/main.cpp):
  - `main.cpp` launching the REST server + serving the WebUI,
    `InstanceLock` (single-instance guard — file lock or bundle-id check
    instead of Windows' registry/mutex approach), a `Registry`-equivalent
    for local config.
  - No `.app` bundle, no `NSStatusItem`, no `LSUIElement` — just a CLI
    binary printing its URL, like Linux/Windows did before tray icons
    landed. Sidesteps code-signing/notarization for now.

### Tray-parity (matches 1.0.2 Windows/Linux shape)

Adds an `.app` bundle, `LSUIElement` agent style, `NSStatusItem` menu, and
`SMAppService` login item — the macOS shapes `GUILaunchUX.md` already
sketched as reference. Also brings in code-signing and notarization as a
real requirement, not an optional nicety: Gatekeeper quarantines unsigned
downloaded binaries, so distributing a zip the way Windows/Linux releases
do would need an Apple Developer ID ($99/yr). Deferred until the
terminal-only slice is working and the audio-capture decision above is
made.

## CMake wiring (either tier)

- Add `AURORA_ENABLE_INPUT_MAC` / `AURORA_ENABLE_APP_MAC` options gated on
  `CMAKE_SYSTEM_NAME STREQUAL "Darwin"` in the root
  [`CMakeLists.txt`](../CMakeLists.txt), plus a `mac-app` preset in
  [`CMakePresets.json`](../CMakePresets.json) mirroring the existing
  `linux-app` / `windows-app` two.
- `input/mac`'s `CMakeLists.txt` needs `enable_language(OBJCXX)` and links
  against `ScreenCaptureKit`, `CoreAudio`, `CoreGraphics`, `AppKit`.

## Verified so far

- `core/` and `output/hue/` build clean and pass their full test suites
  standalone on Apple Silicon (arm64, current macOS) once the mbedtls@3
  pitfall above is worked around: `ctest --test-dir build-hue` → 37/37
  passing. `input/mac` and `app/mac` don't exist yet, so this only confirms
  the shared libraries and toolchain, not a running app.

## Open questions / next steps

- Audio capture approach undecided: Core Audio process taps (macOS 14.4+
  only) vs. a BlackHole-style virtual-driver dependency. Blocks starting
  `input/mac`'s audio path.
- Minimum supported macOS version not yet chosen — affects whether process
  taps are viable at all vs. falling back to the virtual-driver path
  unconditionally.
- Not yet verified hands-on: ScreenCaptureKit frame-capture performance and
  TCC re-prompt behavior across ad-hoc-signed local dev builds.
- Signing/notarization cost and workflow for eventual release zips is
  deferred, but worth flagging early since it affects the release
  distribution story, not just the build.
