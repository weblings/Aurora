# Mac audio-terminal support ships: permission signal + app/mac wiring, verified end to end

Closed `Aurora-9z4.4` and `.5`, the last two required pieces of `Aurora-9z4`
(only `.7`, a non-blocking WebUI-display follow-up, remains open).

## Permission-recovery design (`Aurora-9z4.4`)

Video's `PermissionError`/`PermissionErrorKind` shape (thrown synchronously
from `_initMonitorsList()`, caught by `PipelineHost::reload()`) doesn't
apply to audio at all -- `Aurora-9z4.1` already confirmed `AudioDeviceStart`
always returns `noErr` regardless of grant state, so there's no
construction-time failure to catch. Added
`MacAudioGrabber::isLikelyPermissionDenied()` instead: latches false
forever the instant a real non-zero sample arrives, reports true
beforehand only once a 10s grace window elapses with nothing but zeros.
Deliberately kept Mac-specific (not promoted to `IAudioInput`, matching
`PermissionError`'s own precedent) -- Windows/Linux have no analogous
silent-TCC-denial ambiguity to model. Verified against real hardware: the
already-granted case latches `false` immediately.

## app/mac wiring (`Aurora-9z4.5`)

Turned out to be far less new work than scoped, because `app/mac`'s
original skeleton (`Aurora-8mk.3`) had already ported `app/linux/main.cpp`
wholesale, audio branch included, all correctly `#ifdef
AURORA_RUNTIME_AUDIO_AVAILABLE`-guarded -- `Pipeline::build()`'s audio-mode
branch, `Registry::registerAudioInput`/`audioInputNames`, and
`/api/capabilities`'s `audioInputs` field already existed, dormant, waiting
for a real Mac audio input to register. The actual gap was narrow:
`registerAudioInputs()` itself (`mac-audio` -> `MacAudioGrabber`, no config
parameter needed -- the whole-system tap has no per-sink selection concept,
unlike Linux's PipeWire sink), its call site, and the `#include`.

One real bug found while wiring this in: `app/mac/CMakeLists.txt` had its
*own* hardcoded `AURORA_CORE_ENABLE_AUDIO FALSE`, a second copy of the same
bug `input/mac/CMakeLists.txt` had. Since `app/mac` fetches `AuroraCore`
directly *before* it fetches `AuroraInputMac` (which fetches its own,
deduped-away copy), `app/mac`'s own `set()` call is the one that actually
gates Core's `add_subdirectory(AudioProcessing)` -- input/mac's fix from
the same-day probe session had zero effect on `app/mac` builds until this
was traced and fixed the same way, mirroring `app/linux`'s
`AURORA_APP_ENABLE_LINUX_AUDIO_INPUT` precedent exactly. Filed as a new
`docs/lessons/build-toolchain.md` entry.

Added a new `GET /api/mac/audio-status` route rather than folding the
permission signal into `/api/capabilities` -- that route's heartbeat is
deliberately lock-free per its own existing comment (`DashboardScreen.js`
polls it every 3s to detect a dead server without ever blocking on a held
pipeline mutex), and adding a live pipeline-state field there would have
broken that property. `NSAudioCaptureUsageDescription` added to
`Info.plist.in` (confirmed present in the built bundle via `plutil -p`).

## Verified end to end, not just compiled

Built the real `aurora-app-mac` bundle, launched it against a fresh config
root with the fake Hue bridge (`tools/fake-hue-bridge`, env-var pairing --
no live pairing dance needed), `PUT /api/config` with
`activeAudioInputName=mac-audio`, got `succeeded: true`, and confirmed via
`GET /api/zones` that `AudioOrchestrator::init()` genuinely reconciled and
persisted a real 4-zone map against the live fake output -- the whole
REST-to-`MacAudioGrabber` path works, not just each piece in isolation.
`GET /api/mac/audio-status` returned the correct latched state throughout.
Both `input/mac`'s and `app/mac`'s own test suites re-run clean (12 and 46
assertions respectively, no regressions).

## State

`Aurora-9z4` now 6/7 closed. Filed `Aurora-9z4.7` (WebUI banner for the
permission signal) as an explicit, non-blocking follow-up rather than
silently dropping it -- the pipeline already degrades gracefully to a
calm/silent state without it; this is a diagnostic-only gap, not a
correctness one.
