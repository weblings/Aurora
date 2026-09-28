# MacAudioGrabber lands: real system audio, verified end to end through IAudioInput

Closed `Aurora-9z4.2`, `.3`, `.6` (CMake plumbing, `MacAudioGrabber`,
tests), following straight on from the same day's probe (`Aurora-9z4.1`,
`docs/log/2026-09-28-mac-audio-tap-probe.md`).

## CMake (`Aurora-9z4.2`)

`input/mac/CMakeLists.txt` gained `AURORA_INPUT_MAC_ENABLE_AUDIO` (default
`TRUE`), ties `AURORA_CORE_ENABLE_AUDIO` through it (same shape
`input/linux` already uses), and links `CoreAudio` -- confirmed via a
standalone link check that `AudioToolbox` is not actually needed for this
API surface, despite being a reasonable first guess. Audio folded into the
existing `AuroraInputMac` target rather than a separate
`AuroraInputMacAudio`, deviating from `docs/AudioAnalysis.md`'s original
separate-target sketch in favor of what `input/linux` actually shipped --
simpler, and the real precedent now.

## `MacAudioGrabber` (`Aurora-9z4.3`)

`input/mac/{include/Aurora/Input/Mac/MacAudioGrabber.hpp,src/MacAudioGrabber.mm}`
implements `IAudioInput` against the exact tap+aggregate-device+IOProc
sequence the probe verified, using `initStereoGlobalTapButExcludeProcesses`
with an empty exclude list for whole-system capture. PIMPL, mirroring
`ScreenCaptureKitGrabber`'s existing boundary -- CATapDescription and the
aggregate-device NSDictionary stay inside the `.mm`.

Before writing the buffer-copy logic, ran a second short probe to check a
real assumption rather than guess: does this tap+aggregate-device shape
deliver one interleaved buffer or one mono buffer per channel?
`AudioBufferList` permits either. **Confirmed: one interleaved buffer**
(`mNumberBuffers == 1`, `mNumberChannels == 2`), matching
`kAudioDevicePropertyStreamFormat`'s own report on the aggregate's input
scope (48kHz/2ch/packed-float). Filed as a new `docs/lessons/input.md`
entry -- kept the non-interleaved path as a defensive fallback since
`AudioBufferList` allows it, but it's unexercised here.

Verified end to end through the class's real public interface, not just
inline probe code: a standalone harness linking against the built
`AuroraInputMac`/`AuroraContracts` static libraries constructed
`MacAudioGrabber`, slept 3s, called `readNextBuffer()`, and got 285,696
real non-zero interleaved float32 samples at 48kHz/2ch (98.6% of the
naive 3s expectation, consistent with normal startup latency before
sampling began).

## Tests (`Aurora-9z4.6`)

Followed Windows' precedent (`input/windows/tests/WindowsAudioInputTests.cpp`)
rather than building the fixture `docs/AudioAnalysis.md` had deferred: no
dummy/fixture audio backend, a real-hardware `[.]`-tagged manual test
(`input/mac/tests/MacAudioInputTests.cpp`, `[manual][MacAudioGrabber]`).
Verified both ways: the normal `ctest` suite is unaffected (12 assertions,
3 cases, unchanged), and the manual suite's new audio test passes cleanly
against real system audio -- the only manual-suite failure is the
pre-existing, unrelated `ScreenCaptureKitGrabber` permission test (expected
when the test binary is run bare from Terminal, not its own bundle).

Force-closed `.6` over its `.5` (app wiring) dependency -- that edge was
mis-scoped when filed; input-level grabber tests only ever needed `.3`
done, not app-level wiring.

## State

`Aurora-9z4.1`/`.2`/`.3`/`.6` closed. `Aurora-9z4.4` (permission-recovery
design) and `.5` (app/mac wiring) remain -- `.5` now has a working,
verified grabber to wire in, and `.4`'s design direction is unchanged from
the probe session, just more confidently scoped.
