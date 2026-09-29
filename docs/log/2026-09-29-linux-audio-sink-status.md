# Linux audio sink status: Using-hint replaces the no-list warning

Id: linux-audio-sink-status

Closed `Aurora-4vf` (1.0.4): with default capture working on Linux, the
Dashboard/onboarding audio field showed 'No device list...' as if action were
required. Root cause was unconditional UI -- `showSinkField` was
capability-only, and the reassuring branch was unreachable on Linux. Chose
option (b) over the frontend-only variant: report the sink actually in use,
keep the field editable so the user can change it.

## What landed

- Backend: `AudioGrabber::sinkStatus()` as a concrete-class query via
  `dynamic_cast` (same shape as Mac's `isLikelyPermissionDenied()`;
  `IAudioInput` untouched); `GET /api/linux/audio-status` returns
  `{followingDefault, sinkName}`. `Pipeline`/`PipelineHost` plumbing mirrors
  the Mac route, including the separate-from-heartbeat split (capabilities
  stays lock-free; status takes the pipeline lock on a 5s cadence).
- Pure `makeAudioSinkStatus(requested, resolved)` in the new dependency-free
  `AudioSinkStatus.hpp`, with 3 Catch2 cases in the existing
  `PipewireTests.cpp` (no CMake change, so no reconfigure needed).
- Frontend: `DeviceField` audio hint is now 'Using: X (system default)' /
  'Using sink: X', legacy warning only when status is unknown. The resolved
  name is hint text only, never written into the input (no pinning on save).
  Dashboard polls in Linux audio mode; ModeDeviceScreen fetches on mount and
  after each successful audio apply. `DeviceField.js` mirrored verbatim to
  `web/demo/vendor/webui`; the demo screens needed no port (they strip live
  status per the demo seam, and the new param defaults to null).
- Adjacent fix, same user-visible behavior: `registerAudioInputs` captured
  `targetSinkName` at startup while `reload()` never re-registers, so sink
  edits saved but never applied live. The factory now loads Config fresh per
  build.

## Live verification (this machine: PipeWire 1.0.5 + WirePlumber, `--fake-hue --fresh`)

- The endpoint returned `alsa_output.pci-0000_00_1f.3.analog-stereo`,
  matching `pw-dump`'s `default.audio.sink` metadata exactly.
- PUT round-trip default -> bogus -> real -> default, every step applying
  live (which also proves the stale-capture fix).
- Surprise: a bogus `target.object` readies and links *active to the default
  sink* (confirmed in `pw-dump`) instead of failing -- the constructor's
  'typo never fires param_changed' assumption was wrong on this stack. The
  ctor comment was corrected, the finding filed in `docs/lessons/input.md`,
  and explicit-name validation filed as `Aurora-4xq`. The explicit-case UI
  wording stays neutral ('Using sink:') because of it.
- Considered and rejected a process-recency liveness bool: fallback streams
  process normally, so it would add nothing here.
- No browser screenshot: the render path was proven by a node probe against
  the real `DeviceField.js` (6/6: both hints, legacy fallback, no-pinning,
  escaping) plus the live endpoint shape. Accepted as sufficient; the bead
  stays closed. The probe lives at `/tmp/devicefield-probe.mjs` (throwaway;
  the repo has no maintained JS harness).
- Suites green: input 58 assertions / 19 cases, app 67 / 20. Note:
  `cmake`/`ctest` are not on PATH in this environment; built incrementally
  with `make -C build` and ran the test binaries directly.

## Follow-ups

- `Aurora-4xq` (P3): validate explicit sink names against real PipeWire sinks.
- `Aurora-67y` (P3, relates_to 4vf): enumerate sinks and drive a dropdown
  instead of the free-text field; resolves 4xq for UI users.
