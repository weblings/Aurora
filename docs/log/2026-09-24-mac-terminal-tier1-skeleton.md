# Mac terminal tier-1 skeleton: CMake gating, input/mac, app/mac (paused on TCC probe)

Closed `Aurora-8mk.1`, `.7`, `.2`, `.3` (Mac video-terminal support epic,
`Aurora-8mk`, tagged `1.0.3`/`MacVideoTerminal`), all buildable/testable
on macOS without Linux or a browser -- unlike the `Aurora-gj0` light-viz
work, this track is fully verifiable in-session since it targets the
platform this session runs on. `AURORA_ENABLE_INPUT_MAC`/`AURORA_ENABLE_APP_MAC`
added to the root `CMakeLists.txt` and a `mac-app` preset in
`CMakePresets.json`, initially OFF-by-default (slices didn't exist yet),
then flipped to Darwin auto-detect once they did -- matching Linux/Windows'
own pattern exactly. `input/mac`: `DummyGrabber`/`InputControlDescriptors`
ported from `input/linux`, video-only (Mac tier 1 has no audio input at
all). `app/mac`: `InstanceLock`/`Registry`/`WebRoot` copied verbatim (pure
POSIX/C++, zero changes needed); `main.cpp` ported from `app/linux` minus
`TrayIcon` (no `.app` bundle yet) and the X11/Pipewire backend-selection
dance (only `"dummy"` registered until `Aurora-8mk.5`'s real ScreenCaptureKit
backend); config root moved to `~/Library/Application Support/Aurora`;
`xdg-open` swapped for `open`; `{"platform":"mac"}` added to
`/api/capabilities` (also added to `app/linux`/`app/windows` under
`Aurora-8mk.7`, not build-verified there -- no non-Mac toolchain in this
session).

Verification: 62/62 tests passing through the real `mac-app` preset
(`AuroraInputMacTests`, `AuroraAppMacTests`, `AuroraOutputHueTests`
together). Beyond unit tests, the compiled `build/mac-app/bin/Aurora`
binary was actually run: REST API hit live (`/api/capabilities` correctly
reporting `platform: "mac"`), then a genuinely full pipeline run against
the fake Hue bridge's `conf-room-4zone` config (from the `Aurora-gj0` work)
with `AURORA_DEV_LIGHT_TAP` enabled -- confirmed real animated
`DummyGrabber` frames flowing `Orchestrator` -> `composeFrame` ->
`HueOutput` -> `DevLightTap` -> relay -> SSE end to end, same tooling
built for the light-viz track now validating the Mac track too.

Surprises: porting `app/linux/main.cpp` surfaced a real, independent bug --
`Pipeline::listZones()`/`updateZone()` reference `m_audioOrchestrator`
unconditionally, but it's declared only under `AURORA_RUNTIME_AUDIO_AVAILABLE`
(`tick()` in the same class guards its own reference; these two don't).
Invisible on Linux since its audio toggle has always defaulted ON there;
immediate compile error on Mac, which has no audio input to enable it with.
Fixed locally in `app/mac`'s port, filed separately against `app/linux`
itself as `Aurora-y1q` since it's a latent bug there too, not something the
port introduced. Lesson filed in `docs/lessons/architecture-process.md`.

State: `Aurora-8mk.1/.2/.3/.7` closed. `Aurora-8mk.4` (TCC-identity probe,
P1, gates `.5`/`.6`/`.8`/`.9`/`.10`) blocked twice in a row by the
auto-mode permission classifier when attempted unattended -- reading
`TCC.db` directly, then even a routine `bd update --claim` on that issue.
Stopped rather than retrying further; needs the user present. Everything
else in the epic is downstream of `.4` (`.5` needs both `.3` and `.4`),
so this is the sequence's actual stopping point, not a scope choice.
Resumes with the user running the TCC-identity probe by hand (compile a
throwaway binary calling a TCC-gated capture API, run from Terminal, check
System Settings -> Screen Recording for whether the grant lands on the
binary or on Terminal) -- see docs/MacSupport.md's "Load-bearing risk" /
build-sequencing Phase 3 for the full probe design.
