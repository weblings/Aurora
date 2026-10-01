# Aurora Input: Mac

macOS capture plugin for [Aurora core](../../): screen capture via
ScreenCaptureKit and whole-system audio via Core Audio process taps.
Implements `Aurora::Input::IVideoInput` / `IAudioInput`. Used by
[app/mac](../../app/mac).

## What's here

- **`ScreenCaptureKitGrabber`** — display capture with `selectMonitor()`
  switching (the stream is torn down and rebuilt lazily against the newly
  selected `CGDirectDisplayID`). A missing Screen Recording grant surfaces as
  a distinct permission error (denied vs. still-pending) so the WebUI can show
  recovery steps instead of a generic failure. See [[mac-permissions]].
- **`MacAudioGrabber`** — captures whatever the system is outputting (any
  app), matching WASAPI loopback on Windows and PipeWire's monitor source on
  Linux. macOS 14.2+ (the process-tap API).
- **`DummyGrabber`** — no OS dependency; a fallback and the input the fake
  light-viz stack runs against.
- **`InputControlDescriptors`** — the per-platform control descriptor table.

All ScreenCaptureKit / Core Audio / AppKit types stay inside the `.mm` files
(PIMPL), so headers and every C++ translation unit including them remain plain
C++. Design and history: [[mac-video-capture]], [[mac-audio]].

## Building

Needs a macOS toolchain (Xcode CLT) and Aurora core, resolved by relative path.
The full-app route is the `mac-app` preset at the repo root (see
[CONTRIBUTING.md](../../CONTRIBUTING.md#platform-notes)). Standalone:

```sh
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

`-DAURORA_INPUT_MAC_ENABLE_AUDIO=OFF` builds video-only and skips Core's aubio
requirement. Check `docs/lessons/input.md`
before changing grabbers or pixel formats.
