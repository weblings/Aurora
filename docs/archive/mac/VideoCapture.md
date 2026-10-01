# macOS video capture (tier 1)

Id: mac-video-capture

Status: shipped 2026-09-25 (Aurora-8mk, closed 2026-09-30; its last child
Aurora-8mk.10 — Gatekeeper/notarization distribution — was dropped, see
[[mac-notarization]]). Terminal-only app (`app/mac`), no tray, no
notarization: single-machine builds only. Split out of the old
MacSupport.md (Aurora-le6); audio capture is
[[mac-audio]], the Screen Recording permission investigation is
[[mac-permissions]], tray-parity is [[mac-tray-parity-history]] /
[[mac-tray-parity]].

## Terminal-only, video-only scope

This was the initial scope — it skips the hardest and most speculative
piece (menu-bar tray integration), which the project's own planning doc
already treats as
[an enhancement, never a requirement](../GUILaunchUX.md#L33-L36), and it
deferred audio capture entirely (audio shipped later, see [[mac-audio]]).
Dropping audio also meant the Mac slice needed no `aubio` dependency at
all —
[`core/Runtime/CMakeLists.txt`](../../../core/Runtime/CMakeLists.txt#L41-L47)
already gates the whole audio pipeline behind
`if(TARGET AuroraAudioProcessing)`.

### Load-bearing risk

Resolved 2026-09-25 (Aurora-8mk.4). This tier originally assumed a bare,
unbundled binary could hold its own Screen Recording permission grant,
distinct from whatever terminal emulator launches it. Tested empirically:
compiled a throwaway Mach-O calling
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
notarization ([[mac-notarization]], still deferred, only relevant once a
build is zipped and handed to a second machine). Launching the bundle via
`open` (or double-click) rather than `exec`ing the raw binary routes the
launch through LaunchServices, which resets the responsible-process chain
so the bundle itself — not Terminal — becomes attributable. This is *not*
the same as tray-parity: no `LSUIElement` agent style, no `NSStatusItem`
menu, no `SMAppService` login item — just enough bundle structure to hold
its own TCC identity. Separately, TCC doesn't list an app in System
Settings until it makes a real capture attempt — checking permission
status alone isn't enough to make Aurora show up for the user to grant it
(an Electron project hit exactly this and had to add a throwaway no-op
capture call just to force registration, see
[focusd#1](https://github.com/video-db/focusd/issues/1)) — the bundle
wrapper's own first-run capture attempt covers this for free.

Checked how much of `app/linux` is actually Linux-specific vs. generic
before scoping this, since it changes how much is genuinely new work:
[`InstanceLock.cpp`](../../../app/linux/src/InstanceLock.cpp) is plain POSIX
(`flock`, BSD sockets — compiles unmodified on macOS),
[`Registry.hpp`](../../../app/linux/include/Aurora/App/Registry.hpp) and
[`WebRoot.hpp`](../../../app/linux/include/Aurora/App/WebRoot.hpp) are pure
C++/`std::filesystem` with no OS calls, and `registerOutputs` (Hue) in
`main.cpp` is already OS-agnostic. None of that needed porting — only
copying into `app/mac/`.

- **`input/mac/`** — implements
  [`IVideoInput`](../../../core/Input/include/Aurora/Input/IVideoInput.hpp)
  (`IAudioInput` deferred, see [[mac-audio]]):
  - `ScreenCaptureKit` (the modern, sanctioned API, macOS 12.3+) for frame
    capture, `SCShareableContent.displays` for the `MonitorData` list.
    Needs Objective-C++ (`.mm`) files. `ScreenCaptureKit` delivers frames
    via an async delegate callback rather than a pull, so it needs the same
    push→pull adapter (mutex-guarded latest-frame buffer) that
    [`PipewireGrabber.cpp`](../../../input/linux/src/PipewireGrabber.cpp#L111)
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
  [`app/linux`](../../../app/linux/src/main.cpp) /
  [`app/windows`](../../../app/windows/src/main.cpp). Mostly a copy of
  `app/linux`'s `main.cpp`, with:
  - `InstanceLock`/`Registry`/`WebRoot` copied over unmodified (see above).
  - No `TrayIcon` include or instantiation — matches the pre-tray Linux
    shape this scope targeted.
  - `xdg-open` swapped for macOS's `open` in the browser-launch helper.
  - `registerInputs` registers the ScreenCaptureKit grabber directly
    (no backend-selection dance — see above).
  - Config root defaults to `~/Library/Application Support/Aurora`
    (Mac's idiomatic location for app-owned data files — `~/Library/Preferences`
    is reserved for plist-backed `NSUserDefaults`, which this isn't), same
    `AURORA_CONFIG_DIR` env override pattern as
    [Linux](../../../app/linux/src/main.cpp#L222) /
    [Windows](../../../app/windows/src/main.cpp#L716-L720). Each app hardcodes its
    own default inline — there's no shared cross-platform default to reuse.
  - No `.app` bundle, no `NSStatusItem`, no `LSUIElement` — just a CLI
    binary printing its URL, like Linux/Windows did before tray icons
    landed (see [[mac-tray-parity-history]] for what came after).

## Build history

Phases 0-2 were portable engineering that didn't depend on any permission
decision being resolved first. Phases 4-7 were the only genuinely
macOS-hardware-dependent ones. First pass targeted one machine (this one)
— Gatekeeper/notarization is [[mac-notarization]], explicitly deferred,
not part of this pass.

- **Phase 0 — root CMake Darwin gating (blocks everything else). DONE.**
  Added `AURORA_ENABLE_INPUT_MAC`/`AURORA_ENABLE_APP_MAC` to the root
  [`CMakeLists.txt`](../../../CMakeLists.txt) and a `mac-app` preset mirroring
  `linux-app`/`windows-app` ([`CMakePresets.json:10-22`](../../../CMakePresets.json#L10-L22)).
  *Test:* `cmake --preset mac-app` configures cleanly with everything still
  off — same "confirm the toolchain, not the app" check as `core/`/`output/hue`.
- **Phase 1 — `input/mac` skeleton, `DummyGrabber` only, no
  Objective-C++ yet. DONE.** Ported `DummyGrabber`/`InputControlDescriptors`
  (small — Linux's version is 82 lines total across
  [`DummyGrabber.cpp`](../../../input/linux/src/DummyGrabber.cpp) and
  [`DummyGrabber.hpp`](../../../input/linux/include/Aurora/Input/Linux/DummyGrabber.hpp)),
  plus a `tests/` dir mirroring
  [`input/linux/tests/`](../../../input/linux/tests/) — pure unit tests, no OS
  API calls. Zero macOS-privileged-API risk.
  *Test:* `ctest` — fully automatable, no hardware/permission dependency.
- **Phase 2 — `app/mac` skeleton wired to `dummy` input only. DONE.**
  Copied `InstanceLock`/`Registry`/`WebRoot` over unmodified (already
  confirmed OS-agnostic/POSIX above), wired `main.cpp` the way
  [`app/linux/CMakeLists.txt`](../../../app/linux/CMakeLists.txt) wires its
  FetchContent graph, `xdg-open` → `open`, config root default. No
  ScreenCaptureKit involved yet.
  *Test:* build and run the real binary, `curl` the REST endpoints, load
  the WebUI in a browser, confirm the full pipeline (dummy frames →
  processing → Hue output) runs end-to-end on macOS.
- **Phase 3 — TCC-identity probe. DONE (Aurora-8mk.4, 2026-09-25).**
  Throwaway Mach-O binary calling a TCC-gated capture API
  (`SCShareableContent`), run from Terminal both bare and with an
  embedded `Info.plist`/`CFBundleIdentifier` (`-sectcreate __TEXT
  __info_plist`). Result: **both landed on Terminal**, not the probe
  binary — see [[mac-video-capture#load-bearing-risk]]. Answered both
  questions at once: confirmed tier 1 needed a bundle wrapper (Phase 3b
  below), and confirmed the embedded-plist mechanism alone (without
  LaunchServices launch) doesn't solve it — notarization
  ([[mac-notarization]]) needs the bundle form anyway, not just the
  `-sectcreate` shortcut.
- **Phase 3b — minimal `.app` bundle wrapper for TCC identity
  (Aurora-8mk.11, pulled forward from tray-parity). DONE, verified
  2026-09-25.** Just enough bundle structure
  (`Aurora.app/Contents/{Info.plist,MacOS/Aurora}`) to be launched via
  `open`/double-click instead of `exec`'d directly, so LaunchServices
  resets the responsible-process chain and Aurora itself holds the Screen
  Recording grant. No `LSUIElement`, `NSStatusItem`, or `SMAppService` yet
  — those stayed deferred to real tray-parity ([[mac-tray-parity-history]]).
  Free, local ad-hoc `codesign`, no Apple Developer account needed (that's
  only notarization). Also picked up a bundle icon for free, built from
  the Linux tray icon set (`app/linux/icons/hicolor/*/apps/aurora.png`)
  via `app/mac/make_icns.sh`, embedded through CMake's
  `MACOSX_PACKAGE_LOCATION` mechanism.
  *Test:* rebuilt the Phase 3 probe as a bundle (`tcc-probe-app.app`),
  launched via `open`, checked System Settings → Screen Recording.
  **Confirmed: `tcc-probe-app` listed as its own entry, not Terminal** —
  the LaunchServices-launch fix works. `app/mac`'s CMakeLists.txt built
  `aurora-app-mac` as a `MACOSX_BUNDLE` target the same way, ad-hoc-signed
  post-build. Side effect, not a bug: once Aurora had its own TCC identity,
  a *separate* prompt appeared for the Documents folder on this dev
  machine — because this repo happens to live under `~/Documents/...`,
  and `app/mac`'s baked `AURORA_WEBUI_SOURCE_DIR` reads static files from
  within it. That's a dev-checkout-location artifact (a real install
  won't live under Documents), not a product concern.
- **Phase 4 — ScreenCaptureKit grabber, single display, no
  monitor-switching yet. DONE, verified 2026-09-25 (Aurora-8mk.5).**
  `input/mac/src/ScreenCaptureKitGrabber.mm` (Objective-C++, PIMPL header
  keeps every ScreenCaptureKit/AppKit type out of the C++ side), registered
  as the `"mac"` input name (`"dummy"` stays the default so a fresh install
  never triggers a Screen Recording prompt unasked). `SCShareableContent`'s
  async completion bridged with a bounded `std::promise`/`future` (5s,
  `AudioGrabber.cpp`'s pattern, not `PipewireGrabber`'s unbounded one).
  Points-vs-pixels: `SCDisplay.width/height` matched against `NSScreen`
  (via `NSScreenNumber`) for `backingScaleFactor`, `maximumFramesPerSecond`
  doubling as the refresh rate (`SCDisplay` exposes neither directly).
  `CGDisplayCreateImage` is gone as of macOS 15 — `SCShareableContent`/
  `SCStream` is required, not just preferred.
  *Test, as run:* fake Hue bridge (`tools/fake-hue-bridge`) +
  `tools/light-viz-relay` + `viz.html`, same shape as `Aurora-gj0.7`'s
  Linux baseline. Confirmed real per-zone colors flowing end to end
  (ScreenCaptureKit → subsample → compose → smooth → `HueOutput` →
  `DevLightTap` → relay → `viz.html`), including a dragged colorful window
  visibly shifting the matching lamp's color live. Two TCC gates hit and
  resolved: Screen Recording (System Settings, as expected) and a second,
  separate "bypass the system picker" consent alert (macOS Sequoia+ —
  capturing the whole display directly via `SCContentFilter
  initWithDisplay:excludingWindows:` skips Apple's `SCContentSharingPicker`
  UI, which is the right shape for a background daemon but requires this
  extra one-time consent; it appears *after* `startCaptureWithCompletionHandler`
  already reports success, gating actual frame delivery separately — see
  `docs/lessons/input.md`). `AURORA_DEV_FRAME_DUMP`'s independent
  cross-check tool (`validate.py frame`) didn't receive data on Mac at the
  time (`Aurora-8mk.12`, not a blocker then — later root-caused and fixed
  under `Aurora-gj0.9`, an oversized UDP payload silently dropped by
  macOS's lower `net.inet.udp.maxdgram`) — `AURORA_DEV_LIGHT_TAP` worked
  and was used instead.
- **Phase 5 — multi-monitor: `selectMonitor()`/`hasCustomScreenManagement()`.
  DONE (Aurora-8mk.6).** Lands unverified on real multi-display hardware;
  see `Aurora-8mk.12`'s closing note for the follow-on `DevFrameDump` fix.
- **Phase 6 — permission recovery flow. DONE (Aurora-8mk.8).** Three
  pieces, done together: bounded the Phase 3/4 promise wait and, on
  timeout, returned a structured "permission_pending" response instead of
  holding the `PUT /api/config`/`POST /api/reload` connection open (same
  shape as Hue pairing's `{"error":"link_button_not_pressed"}`,
  [`PairingRoutes.cpp:166-210`](../../../output/hue/src/PairingRoutes.cpp#L166-L210));
  added a `"platform"` field (`"linux"`/`"windows"`/`"mac"`) to
  `/api/capabilities`; WebUI reads `platform` to show the right recovery
  copy instead of the generic startup-failure `catch` in
  [`main()`](../../../app/linux/src/main.cpp#L847). Verified live through a
  real deny/grant cycle. Full design discussion: [[mac-permissions]].
- **Phase 7 — stream health on lock/display sleep. DONE (Aurora-8mk.9).**
  Lock idles then kills the stream after ~1min+; `isHealthy()` self-heals
  via Phase 5's rebuild.

### CMake wiring (video + audio)

- `AURORA_ENABLE_INPUT_MAC` / `AURORA_ENABLE_APP_MAC` options gated on
  `CMAKE_SYSTEM_NAME STREQUAL "Darwin"` in the root
  [`CMakeLists.txt`](../../../CMakeLists.txt), plus a `mac-app` preset in
  [`CMakePresets.json`](../../../CMakePresets.json) mirroring the existing
  `linux-app` / `windows-app` two.
- `input/mac`'s `CMakeLists.txt` needs `enable_language(OBJCXX)` and links
  against `ScreenCaptureKit`, `CoreAudio`, `CoreGraphics`, `AppKit`.
  Audio-specific plumbing (`AURORA_INPUT_MAC_ENABLE_AUDIO` and the
  `AURORA_CORE_ENABLE_AUDIO`-ordering bug it surfaced) is covered in
  [[mac-audio]]'s own Step 1.

## Verified so far

`core/` and `output/hue/` built clean and passed their full test suites
standalone on Apple Silicon (arm64) once the mbedtls@3 pitfall
(`docs/lessons/build-toolchain.md`) was worked around: `ctest --test-dir
build-hue` → 37/37 passing.
