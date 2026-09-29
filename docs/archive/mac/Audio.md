# macOS audio capture

Id: mac-audio

Status: shipped 2026-09-28 (Aurora-9z4, all children closed). Split out of
the old `docs/MacSupport.md` (Aurora-le6); video capture is
[[mac-video-capture]].

Unlike Windows' WASAPI loopback, macOS had no built-in "capture what's
playing" API for most of its history. Two candidate paths were identified
when this scope was originally deferred:

1. Core Audio **process taps** (`AudioHardwareCreateProcessTap`, macOS
   14.4+) — no kernel extension, but needs a separate TCC permission and a
   recent macOS.
2. Ask users to install a virtual loopback driver (BlackHole), closer in
   spirit to how Linux leans on PipeWire monitor sources.

**Version floor**: this looked like it would force a decision — ship
video on a lower 12.3+ floor, then bump later once audio landed and
needed 14.4+ for process taps. Adoption data at the time changed that
calculus: Sonoma (14.x) went end-of-life 2026-08-17, and Sequoia's share
was collapsing hard as Tahoe (26) took over (roughly 55% → 12% across
2026, per
[macOS version share tracking](https://commandlinux.com/statistics/macos-market-share-yearly-trends/)) —
the real-world install base was already almost entirely past 14.4.
Decided: 14.4+ as Aurora's Mac floor from tier 1, rather than framing
this as a future bump.

**Decided: process taps over BlackHole.** The version floor above removed
the only real cost of process taps (needing a recent macOS) while keeping
their real advantage: zero new user-facing install step, matching the
"react to whatever's playing" model Windows (miniaudio/WASAPI loopback)
and Linux (PipeWire monitor source) already ship — BlackHole would have
meant asking every Mac user to install and route through a virtual driver
just to get the same result process taps give natively.

## What was already reusable for free

Audio was not greenfield for Aurora — it already shipped for Windows and
Linux (`Aurora-ljj`, "Phase 2.5 audio stack shipped"), and
[`docs/archive/AudioAnalysis.md`](../AudioAnalysis.md) is the as-built
design, not a speculative one. Everything above the platform boundary was
already generic and needed no Mac-specific work: `IAudioInput`
([`core/Input/include/Aurora/Input/IAudioInput.hpp`](../../../core/Input/include/Aurora/Input/IAudioInput.hpp)),
`Contracts::AudioBuffer`/`AudioFeatures`, `AudioProcessing`/
`AudioFeatureExtractor` (aubio-backed), `AudioOrchestrator`, `Config`'s
audio fields, `/api/capabilities`'s `platform` field (`Aurora-8mk.7`), and
the WebUI's audio screens. The only missing piece was a Mac-specific
`IAudioInput` implementation and its wiring into `app/mac` — the same
shape ScreenCaptureKit filled for video.

## Real opens, checked directly rather than assumed

Looked these up against real API behavior and in-flight developer reports
(late 2026), not recalled from memory, per this project's "verify a
library's real behavior before designing around it" habit:

- **This is a distinct, narrower TCC permission from Screen Recording,
  even though Tahoe 26 lists both under one settings pane.** macOS 26
  Tahoe's Privacy & Security pane is labeled **Screen & System Audio
  Recording**, but it governs two separately-scoped grants: full
  screen+audio (ScreenCaptureKit, what `Aurora-8mk.5`/`.11` already hold)
  and a narrower **"System Audio Recording Only"** grant
  (`NSAudioCaptureUsageDescription`, what a process tap needs) with no
  screen access at all
  ([Recall.ai: how to get access to system audio on macOS](https://www.recall.ai/blog/how-to-get-access-to-system-audio)).
  One pane, two independently-keyed grants — Aurora's existing Screen
  Recording grant from the video work does **not** cover this; expect a
  fresh, separate consent prompt the first time a process tap starts.
- **The aggregate-device step is a silent-failure trap, not a documented
  error.** A tap alone isn't a working capture path: it must be attached
  as a sub-tap on an *aggregate device* whose main sub-device is a real
  output device. Using the tap as the aggregate's only member (empty
  sub-device list) compiles, runs, reports success, and then silently
  delivers all-zero samples forever
  ([Thunder Kitty: "2,000 Buffers of Nothing"](https://www.thunderkitty.app/learn/2000-buffers-of-nothing/)).
  Same class of gotcha `docs/lessons/input.md` already collects for WASAPI
  (zero callbacks, not silent ones). Concrete dictionary shape,
  cross-checked against two independent implementations
  ([sbooth/CAAudioHardware](https://github.com/sbooth/CAAudioHardware/blob/main/Sources/CAAudioHardware/AudioAggregateDevice.swift),
  a community `SoundManager`-style wrapper): `kAudioAggregateDeviceTapListKey`
  → `[{kAudioSubTapUIDKey, kAudioSubTapDriftCompensationKey: true}]`,
  `kAudioAggregateDeviceSubDeviceListKey` → `[{kAudioSubDeviceUIDKey:
  <real output device UID>}]`, `kAudioAggregateDeviceMainSubDeviceKey` →
  that same output UID, plus `kAudioAggregateDeviceIsPrivateKey: true`
  (keeps it from showing up as a selectable device elsewhere) and
  optionally `kAudioAggregateDeviceTapAutoStartKey: true`. Confirmed
  working end to end in Step 0 below.
- **TCC enforcement for this permission is completely silent, and Apple
  has confirmed there's no programmatic way to check it.** Every Core
  Audio call involved returns `noErr` regardless of grant state; the only
  observable symptom of denial is that the callback fires with all-zero
  samples
  ([Thunder Kitty, ibid.](https://www.thunderkitty.app/learn/2000-buffers-of-nothing/)).
  An Apple engineer's own forum reply confirms this isn't a documentation
  gap: *"There is no API to determine whether an app still has permission
  to capture system audio"*, directing developers to file a Feedback
  Assistant enhancement request instead
  ([Apple Developer Forums](https://developer.apple.com/forums/thread/771864)).
  **This breaks an assumption the Screen Recording permission-recovery
  flow ([[mac-permissions]]) was built on**: that flow expects an
  explicit pending/denied signal from a completion handler, the way
  `SCShareableContent` gives one. Audio has no such signal — detecting
  denial means inferring it from behavior (e.g. "N seconds of all-zero
  buffers while the system is known to be producing audio"), a genuinely
  different, fuzzier design, not a port of the video flow.
- **The responsible-process attribution risk is confirmed for this
  permission too, by an independent real-world report — not just an
  inferred parallel.** A Flutter-tooling integration-test report describes
  exactly [[mac-video-capture#load-bearing-risk]]'s finding, for this
  exact permission: *"An app the flutter tool launches is attributed to
  the terminal that runs the tool [for System Audio Recording]... either
  grant that terminal [the permission], or launch the built example app
  via `open` once and click Allow"*
  ([Apple Developer Forums](https://developer.apple.com/forums/thread/756783)).
  That's the identical fix Aurora already built (`Aurora-8mk.11`'s bundle
  + LaunchServices launch) confirmed to generalize to this second TCC
  service by someone else's independent testing, not just a plausible
  guess from Aurora's own Screen Recording fix. Separately, an [Apple
  Developer Forums thread from Tahoe 26.1](https://developer.apple.com/forums/thread/807898)
  is titled around plain executables not appearing under the
  "Screen & System Audio Recording" pane at all, consistent with the same
  root cause.
- **Whole-system capture (not a hand-enumerated process list) is directly
  supported.** `CATapDescription`'s
  `initStereoGlobalTapButExcludeProcesses`, called with an empty (or
  self-only) exclude list, mixes every process's output into one stereo
  stream at the HAL layer
  ([per-app-audio](https://github.com/mavericksxx/per-app-audio),
  [Sunshine PR #4209](https://github.com/LizardByte/Sunshine/pull/4209)).
  Matches the "react to whatever's playing" model Windows/Linux already
  ship, with no need to enumerate or track running audio-producing
  processes.
- **`NSAudioCaptureUsageDescription` had to be added to `Info.plist.in`
  directly** — a manually-typed key, not exposed through normal
  build-setting flows.
- **Entitlements weren't needed** — the entitlement question mostly bites
  sandboxed (App Store) apps; Aurora ships as a plain, non-sandboxed,
  ad-hoc-signed local build, the same shape that already works for Screen
  Recording.
- **The already-known rebuild-invalidates-grant lesson applies again.**
  `docs/lessons/input.md`'s `Aurora-8mk.8` entry found that an ad-hoc
  signature's hash changes every `cmake --build`, silently invalidating a
  previously-granted TCC entry. Grants for this second service are keyed
  the same way, so the same failure mode reproduces.
- **Version floor, re-confirmed rather than re-guessed:** independent
  sources converge on macOS 14.4 as the real public floor for process taps
  ([DGR Labs](https://dgrlabs.co/blog/2026-04-25-capturing-system-audio-on-macos-in-2026.html),
  [Recall.ai](https://www.recall.ai/blog/how-to-get-access-to-system-audio)),
  matching the 14.4+ floor settled on above for unrelated adoption-share
  reasons.

## Build sequence

Mirrored the video tier's own successful shape: resolve the load-bearing
permission/API risk with a cheap, throwaway probe before writing real
code against it, the same move `Aurora-8mk.4` made for Screen Recording
before `input/mac/` existed.

- **Step 0 — probe the tap → aggregate-device → IOProc chain and the
  permission behavior around it, hands-on, on the real dev machine. DONE,
  `Aurora-9z4.1`, 2026-09-28** (full write-up:
  [`docs/log/2026-09-28-mac-audio-tap-probe.md`](../../log/2026-09-28-mac-audio-tap-probe.md)).
  Built a throwaway Objective-C++ probe wrapped as a real bundle
  (`AudioProbe.app`, `com.aurora.audioprobe`), same shape as
  `Aurora-8mk.4`/`.11`'s Screen Recording probe. **Capture mechanism:
  confirmed working on the first attempt** — the exact dictionary shape
  scoped above (real output-device UID as
  `kAudioAggregateDeviceMainSubDeviceKey`, tap in
  `kAudioAggregateDeviceTapListKey`, `kAudioAggregateDeviceIsPrivateKey:
  true`) delivered real, 100%-non-zero system audio from the very first
  `AudioDeviceCreateIOProcID` callback, both run bare from Terminal and
  `open`-launched from the real bundle as a never-before-run identity —
  no aggregate-device misconfiguration, no delay. **Permission signal:
  did not resolve cleanly, even with the user present at the keyboard** —
  a dialog appeared during both runs, but the user (watching the screen
  in real time, since this can't be observed programmatically or by an
  agent without eyes on the display) couldn't attribute either one to a
  specific permission, and `AudioProbe` never appeared as its own entry in
  System Settings afterward despite genuinely capturing real audio. Most
  likely explanation, not fully certain: the same async, non-gating dialog
  behavior `Aurora-8mk.8` already found for `SCShareableContent` generalizes
  to `AudioDeviceStart` too — the OS surfaces the dialog on its own
  schedule without gating the call that triggers it, so both dialogs may
  have appeared after capture had already succeeded. **Net effect:
  strengthens, doesn't change, the already-scoped conclusion** — not just
  "there's no public API to check the grant" (per Apple's own forum
  reply), but "even a human watching the screen couldn't reliably
  attribute the dialogs that appeared." The zero-buffer-over-time-window
  inference approach was the right design, not a reach for a cleaner
  signal that doesn't appear to exist.
- **Step 1 — CMake plumbing. DONE, `Aurora-9z4.2`, 2026-09-28.**
  [`input/mac/CMakeLists.txt`](../../../input/mac/CMakeLists.txt) gained
  `AURORA_INPUT_MAC_ENABLE_AUDIO` (default `TRUE`), tying
  `AURORA_CORE_ENABLE_AUDIO` through it the way `input/linux` already does.
  Links `CoreAudio` only — a standalone link check confirmed `AudioToolbox`
  isn't actually needed for this API surface. Folded into the existing
  `AuroraInputMac` target rather than a separate `AuroraInputMacAudio`,
  deviating from `docs/archive/AudioAnalysis.md`'s original separate-target
  sketch in favor of what `input/linux` actually shipped.
- **Step 2 — `MacAudioGrabber` implementing `IAudioInput`. DONE,
  `Aurora-9z4.3`, 2026-09-28** (full write-up:
  [`docs/log/2026-09-28-mac-audio-grabber-lands.md`](../../log/2026-09-28-mac-audio-grabber-lands.md)).
  Built against Step 0's verified sequence: whole-system tap via
  `initStereoGlobalTapButExcludeProcesses`, delivered through an aggregate
  device + `AudioDeviceCreateIOProcID`, bridged into the pull-based
  `readNextBuffer()` contract with the same mutex-guarded accumulator
  pattern `input/windows/src/AudioGrabber.cpp`'s miniaudio callback
  already uses. Confirmed interleaved (not per-channel mono) sample
  delivery directly, matching `kAudioDevicePropertyStreamFormat`'s own
  report; filed as a new `docs/lessons/input.md` entry. Verified end to
  end through the class's real public interface: a standalone harness got
  285,696 real non-zero interleaved float32 samples at 48kHz/2ch over a
  3s window.
- **Step 3 — audio-specific permission-recovery design. DONE,
  `Aurora-9z4.4`, 2026-09-28.** Not a port of Screen Recording's
  completion-handler shape after all — that shape needs a
  construction-time throw to catch, and `AudioDeviceStart` never provides
  one. Added `MacAudioGrabber::isLikelyPermissionDenied()`: latches
  `false` forever on the first real non-zero sample, reports `true`
  beforehand only once a 10s grace window elapses with nothing but
  zeros. Deliberately kept Mac-specific — not promoted to `IAudioInput`,
  matching `PermissionError`'s own precedent (a platform-specific
  concept) rather than `isHealthy()`'s (a genuinely cross-platform one).
  Verified against real hardware: the already-granted case latches
  `false` immediately.
- **Step 4 — `app/mac` wiring. DONE, `Aurora-9z4.5`, 2026-09-28** (full
  write-up:
  [`docs/log/2026-09-28-mac-audio-app-wiring.md`](../../log/2026-09-28-mac-audio-app-wiring.md)).
  Far less new work than scoped — `app/mac`'s original skeleton
  (`Aurora-8mk.3`) had already ported `app/linux/main.cpp` wholesale,
  audio branch included, dormant behind `#ifdef
  AURORA_RUNTIME_AUDIO_AVAILABLE` guards, waiting for a real Mac audio
  input to register. Only `registerAudioInputs()` itself, its call site,
  and `NSAudioCaptureUsageDescription` in `Info.plist.in` were genuinely
  missing. Found and fixed a second copy of the same
  `AURORA_CORE_ENABLE_AUDIO`-ordering bug Step 1 already fixed in
  `input/mac/CMakeLists.txt` — `app/mac/CMakeLists.txt` fetches
  `AuroraCore` directly, before it fetches `AuroraInputMac` (whose own copy
  gets deduped away), so *its* hardcoded `FALSE` was the one actually
  gating Core's audio subdirectory; filed as a new
  `docs/lessons/build-toolchain.md` entry. Added `GET /api/mac/audio-status`
  as its own route rather than folding into `/api/capabilities`, whose
  heartbeat is deliberately lock-free. Verified fully end to end: built the
  real bundle, launched it against a fresh config root plus
  `tools/fake-hue-bridge` (env-var pairing), `PUT /api/config` with
  `activeAudioInputName=mac-audio` succeeded, and `GET /api/zones`
  confirmed `AudioOrchestrator` genuinely initialized a real zone map
  against the live output. WebUI display for the permission signal filed
  separately as `Aurora-9z4.7`.
- **Step 5 — tests. DONE, `Aurora-9z4.6`, 2026-09-28.** Followed Windows'
  precedent (`input/windows/tests/WindowsAudioInputTests.cpp` — no
  dummy/fixture audio backend, real-hardware-only testing) rather than
  building the fixture `docs/archive/AudioAnalysis.md` had deferred:
  [`input/mac/tests/MacAudioInputTests.cpp`](../../../input/mac/tests/MacAudioInputTests.cpp),
  `[.][manual][MacAudioGrabber]`-tagged. Verified both ways: the normal
  `ctest` suite is unaffected, and the manual suite's new audio test passes
  cleanly against real system audio.
- **Step 6 — WebUI banner for the permission signal. DONE, `Aurora-9z4.7`,
  2026-09-28.** A new [`renderAudioPermissionBanner`](../../../web/ui/MacPermissionRecovery.js)
  (worded as a heuristic — "doesn't seem to be capturing real audio" — not
  the sticky, confirmed language `renderReloadError` uses for Screen
  Recording, since this is genuinely inferred, not a hard signal) shown in
  [`DashboardScreen.js`](../../../web/ui/screens/DashboardScreen.js)'s top tier
  while in audio mode. Its own poll (`_startAudioStatusPoll`,
  `GET /api/mac/audio-status`, 5s cadence) deliberately doesn't ride along
  on `_startHeartbeat`'s tick — that poll is documented lock-free on
  purpose, and this one isn't as time-critical. No verified deep link
  exists straight to the "System Audio Recording Only" settings row (unlike
  Screen Recording's `Privacy_ScreenCapture` anchor), so the banner links to
  the general Privacy & Security pane rather than guessing one. Verified
  the served files and the full REST path (`PUT /api/config` →
  `GET /api/mac/audio-status`) end to end against the real running app; not
  verified in an actual browser DOM — no browser-automation tooling was
  available that session, flagged rather than silently assumed.
