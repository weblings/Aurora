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

### Terminal-only, video-only (initial scope)

This is the starting point — it skips the hardest and most speculative
piece (menu-bar tray integration), which the project's own planning doc
already treats as
[an enhancement, never a requirement](GUILaunchUX.md#L25-L28), and it
defers audio capture entirely (see "Deferred: audio" below). Dropping audio
also means the Mac slice needs no `aubio` dependency at all —
[`core/Runtime/CMakeLists.txt`](../core/Runtime/CMakeLists.txt#L41-L47)
already gates the whole audio pipeline behind
`if(TARGET AuroraAudioProcessing)`.

**Load-bearing risk, resolved 2026-09-25 (Aurora-8mk.4)**: this tier
originally assumed a bare, unbundled binary could hold its own Screen
Recording permission grant, distinct from whatever terminal emulator
launches it. Tested empirically: compiled a throwaway Mach-O calling
`SCShareableContent.getShareableContentWithCompletionHandler` two ways —
once totally bare, once with an embedded `Info.plist`/`CFBundleIdentifier`
via `-sectcreate __TEXT __info_plist` — and ran both directly from
Terminal. **Both landed on Terminal in System Settings → Privacy &
Security → Screen Recording, not on the probe binary itself**, confirming
the risk: TCC attributes the permission request up the launching chain to
the "responsible process" (here, Terminal), and an embedded Info.plist
alone doesn't change that when the binary is still `exec`'d directly by a
shell rather than launched through LaunchServices (a compiled binary
launched from iTerm2 logged
`responsible path = .../iTerm.app/Contents/MacOS/iTerm2`, per
[Qt's writeup on responsible-process attribution](https://www.qt.io/blog/the-curious-case-of-the-responsible-process),
matching what we saw).

Decision: pull forward a minimal `.app` bundle into tier 1 rather than
accept Terminal-attribution (Aurora-8mk.11). This costs nothing and needs
no Xcode/Apple Developer account — a bundle is just a directory
(`Aurora.app/Contents/{Info.plist,MacOS/Aurora}`) plus a free local
ad-hoc `codesign`; the $99/yr Developer ID requirement only shows up at
notarization (Phase 8, still deferred, only relevant once a build is
zipped and handed to a second machine). Launching the bundle via `open`
(or double-click) rather than `exec`ing the raw binary routes the launch
through LaunchServices, which resets the responsible-process chain so the
bundle itself — not Terminal — becomes attributable. This is *not* the
same as tray-parity: no `LSUIElement` agent style, no `NSStatusItem` menu,
no `SMAppService` login item — just enough bundle structure to hold its
own TCC identity. Separately, TCC doesn't list an app in System Settings
until it makes a real capture attempt — checking permission status alone
isn't enough to make Aurora show up for the user to grant it (an Electron
project hit exactly this and had to add a throwaway no-op capture call
just to force registration, see
[focusd#1](https://github.com/video-db/focusd/issues/1)) — the bundle
wrapper's own first-run capture attempt covers this for free.

Checked how much of `app/linux` is actually Linux-specific vs. generic
before scoping this, since it changes how much is genuinely new work:
[`InstanceLock.cpp`](../app/linux/src/InstanceLock.cpp) is plain POSIX
(`flock`, BSD sockets — compiles unmodified on macOS),
[`Registry.hpp`](../app/linux/include/Aurora/App/Registry.hpp) and
[`WebRoot.hpp`](../app/linux/include/Aurora/App/WebRoot.hpp) are pure
C++/`std::filesystem` with no OS calls, and `registerOutputs` (Hue) in
`main.cpp` is already OS-agnostic. None of that needs porting — only
copying into `app/mac/`.

- **`input/mac/`** — implements
  [`IVideoInput`](../core/Input/include/Aurora/Input/IVideoInput.hpp)
  (`IAudioInput` deferred, see below):
  - `ScreenCaptureKit` (the modern, sanctioned API, macOS 12.3+) for frame
    capture, `SCShareableContent.displays` for the `MonitorData` list.
    Needs Objective-C++ (`.mm`) files. `ScreenCaptureKit` delivers frames
    via an async delegate callback rather than a pull, so it needs the same
    push→pull adapter (mutex-guarded latest-frame buffer) that
    [`PipewireGrabber.cpp`](../input/linux/src/PipewireGrabber.cpp#L111)
    already uses for its callback-driven backend — not a new pattern, just
    a new backend. Frame format is BGRA off `CVPixelBuffer`, mapping
    directly onto `Contracts::PixelFormat::BGRA` wrapping a `cv::Mat`.
  - Watch for points-vs-pixels: `SCDisplay.width`/`height` are reported in
    points, while `SCStreamConfiguration.width`/`height` are pixels —
    feeding the former straight into the latter silently captures at half
    resolution on a 2x Retina display (`streamConfig.width`/`height` needs
    `display.width`/`height * scaleFactor`). This affects
    `displayResolution()`'s contract directly, since
    `subsampleResolutionCandidates()` assumes one coherent pixel
    resolution per monitor — a mixed-DPI setup (Retina built-in + 1x
    external) needs per-display scale-factor handling, not one global
    scale.
  - No `SessionDispatch`-style backend-selection needed — Linux picks
    between X11/Wayland-portal/Gamescope-PipeWire at runtime; macOS has
    exactly one capture API, so `input.mac`'s grabber registers directly.
  - Mirrors `DummyGrabber`/`InputControlDescriptors` from the Linux/Windows
    slices (pure C++/OpenCV, no OS calls, near-verbatim ports) — `DummyGrabber`
    is what lets the whole pipeline get tested before ScreenCaptureKit
    permission/plumbing is working.
- **`app/mac/`** — thin shell tying `core/` + `input/mac/` + `output/hue/`
  together, same shape as
  [`app/linux`](../app/linux/src/main.cpp) /
  [`app/windows`](../app/windows/src/main.cpp). Mostly a copy of
  `app/linux`'s `main.cpp`, with:
  - `InstanceLock`/`Registry`/`WebRoot` copied over unmodified (see above).
  - No `TrayIcon` include or instantiation — matches the pre-tray Linux
    shape this scope targets.
  - `xdg-open` swapped for macOS's `open` in the browser-launch helper.
  - `registerInputs` registers the ScreenCaptureKit grabber directly
    (no backend-selection dance — see above).
  - Config root defaults to `~/Library/Application Support/Aurora`
    (Mac's idiomatic location for app-owned data files — `~/Library/Preferences`
    is reserved for plist-backed `NSUserDefaults`, which this isn't), same
    `AURORA_CONFIG_DIR` env override pattern as
    [Linux](../app/linux/src/main.cpp#L222) /
    [Windows](../app/windows/src/main.cpp#L716-L720). Each app hardcodes its
    own default inline — there's no shared cross-platform default to reuse.
  - No `.app` bundle, no `NSStatusItem`, no `LSUIElement` — just a CLI
    binary printing its URL, like Linux/Windows did before tray icons
    landed.

### Deferred: audio

Unlike Windows' WASAPI loopback, macOS has no built-in "capture what's
playing" API for most of its history. Two candidate paths, to decide
between whenever audio scope reopens:

1. Core Audio **process taps** (`AudioHardwareCreateProcessTap`, macOS
   14.4+) — no kernel extension, but needs a separate "Audio Capture" TCC
   permission and a recent macOS.
2. Ask users to install a virtual loopback driver (BlackHole), closer in
   spirit to how Linux leans on PipeWire monitor sources.

**Version floor**: this looked like it would force a decision — ship
video now on a lower 12.3+ floor, then bump later once audio lands and
needs 14.4+ for process taps. Current adoption data changes that
calculus: Sonoma (14.x) went end-of-life 2026-08-17, and Sequoia's share
has been collapsing hard as Tahoe (26) takes over (roughly 55% → 12%
across 2026, per
[macOS version share tracking](https://commandlinux.com/statistics/macos-market-share-yearly-trends/)) —
the real-world install base is already almost entirely past 14.4.
Recommendation: set 14.4+ as Aurora's Mac floor from tier 1, rather than
framing this as a future bump.

### Tray-parity (matches 1.0.2 Windows/Linux shape)

Adds an `.app` bundle, `LSUIElement` agent style, `NSStatusItem` menu, and
`SMAppService` login item — the macOS shapes `GUILaunchUX.md` already
sketched as reference. Also brings in code-signing and notarization as a
real requirement, not an optional nicety: Gatekeeper quarantines unsigned
downloaded binaries, so distributing a zip the way Windows/Linux releases
do would need an Apple Developer ID ($99/yr). Deferred until the
terminal-only slice is working and the audio-capture decision above is
made.

## Build sequencing

Phases 0-2 are portable engineering that don't depend on any permission
decision being resolved first. Phases 4-7 are the only genuinely
macOS-hardware-dependent ones. First pass targets one machine (this one) —
Phase 8 (Gatekeeper/notarization) is explicitly deferred, not part of this
pass.

- **Phase 0 — root CMake Darwin gating (blocks everything else).** Add
  `AURORA_ENABLE_INPUT_MAC`/`AURORA_ENABLE_APP_MAC` to the root
  [`CMakeLists.txt`](../CMakeLists.txt) and a `mac-app` preset mirroring
  `linux-app`/`windows-app` ([`CMakePresets.json:10-22`](../CMakePresets.json#L10-L22)).
  *Test:* `cmake --preset mac-app` configures cleanly with everything still
  off — same "confirm the toolchain, not the app" check the Setup section
  already does for `core/`/`output/hue`.
- **Phase 1 — `input/mac` skeleton, `DummyGrabber` only, no
  Objective-C++ yet.** Port `DummyGrabber`/`InputControlDescriptors`
  (small — Linux's version is 82 lines total across
  [`DummyGrabber.cpp`](../input/linux/src/DummyGrabber.cpp) and
  [`DummyGrabber.hpp`](../input/linux/include/Aurora/Input/Linux/DummyGrabber.hpp)),
  plus a `tests/` dir mirroring
  [`input/linux/tests/`](../input/linux/tests/) — pure unit tests, no OS
  API calls. Zero macOS-privileged-API risk.
  *Test:* `ctest` — fully automatable, no hardware/permission dependency.
- **Phase 2 — `app/mac` skeleton wired to `dummy` input only.** Copy
  `InstanceLock`/`Registry`/`WebRoot` over unmodified (already confirmed
  OS-agnostic/POSIX above), wire `main.cpp` the way
  [`app/linux/CMakeLists.txt`](../app/linux/CMakeLists.txt) wires its
  FetchContent graph, `xdg-open` → `open`, config root default. No
  ScreenCaptureKit involved yet.
  *Test:* build and run the real binary, `curl` the REST endpoints, load
  the WebUI in a browser, confirm the full pipeline (dummy frames →
  processing → Hue output) runs end-to-end on macOS.
- **Phase 3 — TCC-identity probe (cheap; run in parallel with Phase
  1/2, land before Phase 4). DONE (Aurora-8mk.4, 2026-09-25).**
  Throwaway Mach-O binary calling a TCC-gated capture API
  (`SCShareableContent`), run from Terminal both bare and with an
  embedded `Info.plist`/`CFBundleIdentifier` (`-sectcreate __TEXT
  __info_plist`). Result: **both landed on Terminal**, not the probe
  binary — see "Load-bearing risk" above. Answered both questions at
  once: confirms tier 1 needs a bundle wrapper (Phase 3b below), and
  confirms the embedded-plist mechanism alone (without LaunchServices
  launch) doesn't solve it — notarization (Phase 8) will need the bundle
  form anyway, not just the `-sectcreate` shortcut.
- **Phase 3b — minimal `.app` bundle wrapper for TCC identity
  (Aurora-8mk.11, pulled forward from tray-parity). DONE, verified
  2026-09-25.** Just enough bundle structure
  (`Aurora.app/Contents/{Info.plist,MacOS/Aurora}`) to be launched via
  `open`/double-click instead of `exec`'d directly, so LaunchServices
  resets the responsible-process chain and Aurora itself holds the Screen
  Recording grant. No `LSUIElement`, `NSStatusItem`, or `SMAppService` yet
  — those stay deferred to real tray-parity. Free, local ad-hoc
  `codesign`, no Apple Developer account needed (that's only Phase
  8/notarization). Also picked up a bundle icon for free, built from the
  Linux tray icon set (`app/linux/icons/hicolor/*/apps/aurora.png`) via
  `app/mac/make_icns.sh`, embedded through CMake's `MACOSX_PACKAGE_LOCATION`
  mechanism.
  *Test:* rebuilt the Phase 3 probe as a bundle (`tcc-probe-app.app`),
  launched via `open`, checked System Settings → Screen Recording.
  **Confirmed: `tcc-probe-app` listed as its own entry, not Terminal** —
  the LaunchServices-launch fix works. `app/mac`'s CMakeLists.txt now
  builds `aurora-app-mac` as a `MACOSX_BUNDLE` target the same way,
  ad-hoc-signed post-build. Side effect, not a bug: once Aurora had its
  own TCC identity, a *separate* prompt appeared for the Documents folder
  on this dev machine — because this repo happens to live under
  `~/Documents/...`, and `app/mac`'s baked `AURORA_WEBUI_SOURCE_DIR` reads
  static files from within it. That's a dev-checkout-location artifact
  (a real install won't live under Documents), not a product concern.
- **Phase 4 — ScreenCaptureKit grabber, single display, no
  monitor-switching yet.** `enable_language(OBJCXX)`, link
  `ScreenCaptureKit`/`CoreGraphics`/`AppKit`, implement the async→sync
  bridge with a *bounded* wait (mirror
  [`AudioGrabber.cpp:38`](../input/linux/src/AudioGrabber.cpp#L38)'s
  `wait_for`, not `PipewireGrabber`'s unbounded one — see "Bridging the
  async permission wait" above), get points-vs-pixels scaling right from
  the start.
  *Test:* swap `dummy` for the real "mac" input via `registerInputs`, run
  `app/mac` via the Phase 3b bundle wrapper (not raw `exec`, now that
  Phase 3 showed that changes who holds the grant), confirm frames flow
  (no visual-preview endpoint exists yet on any platform, so correctness
  here is indirect — via Hue output behavior or an ad-hoc frame dump —
  until/unless a preview route gets added).
- **Phase 5 — multi-monitor: `selectMonitor()`/`hasCustomScreenManagement()`.**
  Only after single-display capture is solid; check whether
  `X11Grabber`/`PipewireGrabber` already have prior art for stream-rebuild
  before designing mac's from scratch.
  *Test:* needs a second display — switch input source in the WebUI,
  confirm the stream follows.
- **Phase 6 — permission recovery flow.** Three pieces, done together:
  1. Bound the Phase 3/4 promise wait and, on timeout, return a
     structured "permission_pending" response instead of holding the
     `PUT /api/config`/`POST /api/reload` connection open — same shape as
     Hue pairing's `{"error":"link_button_not_pressed"}`
     ([`PairingRoutes.cpp:166-210`](../output/hue/src/PairingRoutes.cpp#L166-L210)).
  2. Add a `"platform"` field (`"linux"`/`"windows"`/`"mac"`, a hardcoded
     literal per app binary) to `/api/capabilities`
     ([`registerCapabilitiesRoute`](../app/linux/src/main.cpp#L698-L729))
     — its existing contract is already "what does the frontend need to
     adapt to," matching this use case directly. Each platform's
     `main.cpp` owns its own copy of this function
     ([`app/windows/src/main.cpp:629`](../app/windows/src/main.cpp#L629)
     duplicates it independently), so this is a few-line addition to each
     of the three app binaries, not a shared-code redesign — purely
     additive JSON key, no schema validation on the WebUI side to break
     ([`app.js`](../web/ui/app.js),
     [`ModeDeviceScreen.js`](../web/ui/screens/ModeDeviceScreen.js),
     [`DashboardScreen.js`](../web/ui/screens/DashboardScreen.js) are
     plain JS, confirmed no strict parsing). Independent of the rest of
     Mac work — could land any time, including before Phase 0.
  3. WebUI reads `platform` to show the right recovery copy (System
     Settings deep link, "quit and relaunch") instead of the current
     top-level `catch` in [`main()`](../app/linux/src/main.cpp#L847) that
     just prints and exits.
  *Test:* `tccutil reset ScreenCapture` to force a clean-denial state,
  confirm the request returns pending/denied instead of hanging (script a
  couple of concurrent unrelated requests during the wait to confirm the
  thread pool isn't starved), then grant via System Settings and confirm
  the documented relaunch-required behavior matches reality.
- **Phase 7 — stream health on lock/display sleep.** Resolve the
  `isHealthy()` open question based on what's actually observed, not
  what's assumed.
  *Test:* lock the screen mid-stream, observe whether the app crashes,
  freezes, silently serves a stale frame, or reports unhealthy.
- **Phase 8 — Gatekeeper/notarization (deferred, not part of this
  pass).** Not needed for phases 0-7: Gatekeeper only fires on files
  carrying the `com.apple.quarantine` extended attribute, which is set by
  whatever app *wrote* a downloaded file (Safari, Mail, AirDrop) — a
  binary built and run locally via `cmake --build` never gets it, so
  nothing in this pass triggers Gatekeeper at all. It becomes relevant the
  moment a built artifact is zipped and handed to a second person, or
  self-downloaded through a browser even once. When that's needed: Apple
  Developer Program membership ($99/yr) for a Developer ID Application
  certificate, `codesign --options runtime`, `notarytool submit` (works
  for standalone CLI binaries, not just `.app` bundles, but still needs
  the embedded `Info.plist` from the Phase 3 probe), then
  `stapler staple`. For CI later, an App Store Connect API key (`.p8`)
  instead of a personal Apple-ID password. Worth doing sooner than
  "eventually" once Phase 3 resolves — a stable Developer ID signature is
  also the fix for the ad-hoc-signature re-prompt-per-rebuild annoyance
  under "Screen Recording permission" above, so it solves both problems
  at once rather than two deferred ones. See also "Tray-parity" above.

## CMake wiring (either tier)

- Add `AURORA_ENABLE_INPUT_MAC` / `AURORA_ENABLE_APP_MAC` options gated on
  `CMAKE_SYSTEM_NAME STREQUAL "Darwin"` in the root
  [`CMakeLists.txt`](../CMakeLists.txt), plus a `mac-app` preset in
  [`CMakePresets.json`](../CMakePresets.json) mirroring the existing
  `linux-app` / `windows-app` two.
- `input/mac`'s `CMakeLists.txt` needs `enable_language(OBJCXX)` and links
  against `ScreenCaptureKit`, `CoreAudio`, `CoreGraphics`, `AppKit`.

## Screen Recording permission: re-prompting, codesigning, and the Ubuntu parallel

A bare, ad-hoc-signed (or unsigned) dev binary will re-trigger the macOS
Screen Recording consent dialog on every rebuild, not just every run.
Decided: accept this during development rather than chase a codesign fix,
because the fix doesn't actually work at the complexity it'd cost:

- macOS's TCC store keys a Screen Recording grant to the requesting
  process's code identity. For a binary signed with a real **Developer ID**
  (Team ID present), that identity is stable across rebuilds, so the grant
  persists. For an **ad-hoc** signature (`codesign -s -`, no Team ID —
  the only kind free to produce), the signature's hash is derived from the
  binary's own contents, so it changes on every recompile. `codesign` here
  is a one-line build step, but it doesn't buy the stability that would
  actually stop the re-prompting.
- So this isn't a separate problem to solve now — it's the same Developer
  ID / notarization requirement already called out under "Tray-parity"
  below for eventual release zips (Gatekeeper). There's no cheap
  intermediate fix; either pay for the stable identity or accept
  re-prompting until that point. Re-prompting during `cmake --build` +
  manual test cycles is a minor dev-loop annoyance, not a correctness risk.

**Ubuntu parallel:** yes, and Aurora already has a solved version of it on
the Linux side. The Wayland/`xdg-desktop-portal` ScreenCast path (used on
GNOME, so likely what a Wayland-session Ubuntu 24.04 install hits) shows
the same kind of first-use consent dialog Screen Recording does on macOS.
[`XdgDesktopPortal.cpp`](../input/linux/src/XdgDesktopPortal.cpp#L343-L468)
already implements the portal's fix for it: it requests `persist_mode = 2`
(permanent) and stores the returned `restore_token`, replaying it on the
next request so the portal skips the dialog on subsequent launches — this
is the direct analog to what a stable macOS code identity would buy.

If the repeated prompt you saw on Ubuntu 24.04 was this native app (not a
browser `getDisplayMedia()` prompt from the WebUI/demo, which is a separate
mechanism), the restore-token persistence not actually holding across runs
would be worth a closer look as a real bug — that's a different claim than
"Linux doesn't have this problem," and I haven't verified which one it is.
Worth confirming: was that an X11 or Wayland session? X11's `XShm` grab
([`X11Grabber.cpp`](../input/linux/src/X11Grabber.cpp)) goes through no
portal and shouldn't prompt at all, so a repeating prompt there would point
somewhere else entirely.

### Recovery flow: denial is sticky, not re-askable

Unlike the Wayland portal dialog (re-askable each session), macOS's Screen
Recording prompt doesn't reappear after a refusal — the user has to open
System Settings → Privacy & Security → Screen Recording (renamed **Screen
& System Audio Recording** in Tahoe 26) themselves, flip Aurora on, then
fully quit (Cmd+Q, not just close the window) and relaunch before the
grant takes effect. Sequoia 15+ additionally re-prompts weekly for apps
holding standing access, as a privacy nudge — expect that as ongoing
behavior, not a one-time setup step.

- A deep link straight to the right pane
  (`x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`)
  is documented as working through Ventura/Sonoma-era System Settings;
  worth confirming it still resolves under Tahoe's renamed pane once
  there's a dev machine to check on.
- `tccutil reset ScreenCapture` clears all Screen Recording grants
  (useful when a rebuild changes the app's identity enough that macOS
  treats it as a stale/duplicate entry) — worth documenting as a dev-loop
  escape hatch in the Setup section regardless of which tier ships.
- The WebUI needs a distinct state for "permission denied, here's how to
  fix it" pointing at System Settings, rather than the current top-level
  `catch` in [`main()`](../app/linux/src/main.cpp#L847) that just prints
  and exits — that pattern is fine for Linux/Windows startup failures but
  not for a mid-session, user-fixable permission gap.

### Bridging the async permission wait into IVideoInput's sync contract

`IVideoInput::init()`/`_initMonitorsList()` are synchronous (return
`void`) — [`IVideoInput.hpp:41-44`](../core/Input/include/Aurora/Input/IVideoInput.hpp#L41-L44)
— but `SCShareableContent.getShareableContent(completionHandler:)` and the
first-run TCC prompt are async (GCD completion handler). Linux already
solves the same shape of problem for the portal dialog:
`XdgDesktopPortal::Capture` bridges its async D-Bus negotiation to
blocking code with a `std::promise<bool> fdReadyPromise`
([`XdgDesktopPortal.hpp:56`](../input/linux/include/Aurora/Input/Linux/XdgDesktopPortal.hpp#L56)),
so the mac grabber should follow the same pattern rather than invent one —
wrap the completion handler in a promise/semaphore and block in
`_initMonitorsList()`. GCD completion handlers run on a background
dispatch queue, not tied to a run loop, so blocking the calling thread
this way shouldn't need an `NSApplication`/run-loop pump — worth a
one-line empirical confirmation alongside the responsible-process test
above, since it's exactly the kind of Apple-platform assumption worth
checking rather than trusting.

**The wait needs a bound, and the request handling around it does too.**
Traced the actual call chain: a WebUI settings save (`PUT /api/config`) or
`POST /api/reload` runs `Pipeline::build()` → `registry.createInput()`
synchronously on the HTTP request thread
([`main.cpp:392`](../app/linux/src/main.cpp#L392), reload wiring at
[`main.cpp:569-596`](../app/linux/src/main.cpp#L569-L596) and
[`SettingsRoutes.cpp:141`](../core/Runtime/src/SettingsRoutes.cpp#L141)),
with the response held open until the grabber constructor returns. The
server is stock cpp-httplib with a per-connection thread pool, so a hang
there only ties up one connection/pool-thread rather than the whole server
— but it's still a real hang, and there's already a live version of this
bug on Linux today: [`PipewireGrabber.cpp:55-64`](../input/linux/src/PipewireGrabber.cpp#L55-L64)
waits on its readiness future with a bare `.wait()` — unbounded, no
timeout — so a portal dialog that's dismissed without an answer hangs that
HTTP request forever. [`AudioGrabber.cpp:38`](../input/linux/src/AudioGrabber.cpp#L38)
already does this correctly for its own Pipewire wait
(`wait_for(std::chrono::seconds(5))`, with a comment explaining the
constructor shouldn't hang forever) — that's the in-repo pattern the mac
grabber's promise wait should copy, not `PipewireGrabber`'s. (Worth its
own fix on the Linux side independent of Mac scope — this isn't
Mac-specific, just surfaced while tracing the pattern for Mac.)

No REST-facing "pending" status mechanism exists yet to reuse as-is. The
closest in-repo shape is Hue pairing
([`PairingRoutes.cpp:166-210`](../output/hue/src/PairingRoutes.cpp#L166-L210)):
`PUT /api/hue/register` returns immediately with a structured
`{"error":"link_button_not_pressed"}` and the WebUI polls/retries rather
than the server blocking. The mac permission wait should follow that shape
— bound the wait, and on timeout return a structured "permission_pending"
response instead of holding the connection open — but the generic version
of that pattern doesn't exist yet and would need to be built new.

## Verified so far

- `core/` and `output/hue/` build clean and pass their full test suites
  standalone on Apple Silicon (arm64, current macOS) once the mbedtls@3
  pitfall above is worked around: `ctest --test-dir build-hue` → 37/37
  passing. `input/mac` and `app/mac` don't exist yet, so this only confirms
  the shared libraries and toolchain, not a running app.

## Open questions / next steps

- **First test to run, gates the whole tier**: compile a throwaway
  Mach-O binary calling a TCC-gated capture API, launch it from Terminal,
  and check whether the Screen Recording grant/prompt attributes to the
  binary or to Terminal itself (see "Load-bearing risk" above). If it
  lands on Terminal, the no-`.app`-bundle premise of tier 1 doesn't hold.
  The same throwaway binary can also confirm the async-permission-wait
  bridging works without a run loop (see "Bridging the async permission
  wait" above).
- Confirm the repeated Ubuntu 24.04 Screen Recording-style prompt (session
  type, native app vs. WebUI browser prompt) — see above; may be a real
  restore-token bug rather than expected behavior.
- Audio capture approach undecided (deferred, out of this scope): Core
  Audio process taps (macOS 14.4+ only) vs. a BlackHole-style
  virtual-driver dependency. Version-floor question resolved — see
  "Version floor" above.
- `IVideoInput` has no error/health signaling hook — `grabFrameSubsample`
  just returns whatever's buffered, with no way to report "stream died"
  (e.g. macOS suspending capture on screen lock, which happens far more
  aggressively than Linux/Windows privacy suspension). Decide whether to
  add something like an optional `isHealthy()` (default `true`, so
  Linux/Windows are unaffected) before building the mac grabber, or treat
  it as mac-only state the WebUI can't see.
- `selectMonitor()`/`hasCustomScreenManagement()` — switching the
  captured display on ScreenCaptureKit likely means tearing down and
  rebuilding the `SCStream`/`SCContentFilter`, not flipping an index.
  Check whether `X11Grabber`/`PipewireGrabber` already have prior art for
  this before designing mac's from scratch.
- Whether `SCShareableContent` enumeration itself is gated behind Screen
  Recording permission (returns empty until granted) — if so, the WebUI's
  monitor picker needs an explicit empty/pre-grant state, unlike
  Linux/Windows where enumeration is unprivileged.
- Not yet verified hands-on: ScreenCaptureKit frame-capture performance,
  and TCC prompt behavior in practice across rebuilds during dev — also
  where the bounded-wait/pending-status design above gets its first real
  test.
- Signing/notarization cost and workflow for eventual release zips is
  deferred, but worth flagging early since it affects the release
  distribution story, not just the build.
- Separate from Mac scope, but surfaced while tracing the permission-wait
  pattern: `PipewireGrabber`'s unbounded `.wait()` on its readiness future
  ([`PipewireGrabber.cpp:55-64`](../input/linux/src/PipewireGrabber.cpp#L55-L64))
  is a real bug on Linux today — a dismissed portal dialog hangs that HTTP
  request forever. Worth its own fix, independent of this doc.
- Once the mac grabber's construction-time cost (portal-equivalent wait)
  is understood, worth relating to the already-open capture-source
  save/reload latency question (unrelated bead, same underlying "how long
  does swapping inputs take" concern) — same latency budget question,
  different platform.
