# Audio sink dropdown replaces the free-text field

Id: linux-audio-sink-dropdown

Closed `Aurora-67y` (1.0.4 follow-up to `Aurora-4vf`): the Linux audio
device field is now a dropdown of real PipeWire sinks with a System
default entry, instead of a free-text field plus a "type the name
exactly" hint. Selections are always valid node names, which resolves
`Aurora-4xq` for UI users (a typo can't be entered anymore); 4xq itself
stays open for non-UI paths (hand-edited config).

## What landed

- Backend: `enumerateAudioSinks()` (`input/linux`, behind
  `AURORA_INPUT_LINUX_AUDIO_AVAILABLE`, no `IAudioInput` change) opens
  its own short-lived PipeWire connection, collects `Audio/Sink`
  registry globals through the pure `matchAudioSinkNode()` helper
  (header-only, `GamescopeNodeMatch.hpp` precedent), and bounds the
  wait at 3s via worker-thread + future + cross-thread
  `pw_main_loop_quit` (the `AudioGrabber` ctor/`_stop` shape).
  `GET /api/linux/audio-sinks` returns `{sinks: [{name,
  description}]}`; lock-free (independent of the pipeline, works in any
  mode), empty list when audio is compiled out.
- Frontend: `DeviceField` audio branch renders the existing `Dropdown`
  (commit-on-explicit-gesture, string values), fetching lazily on
  first open plus a Refresh link -- never on render or the 5s status
  poll. A persisted-but-unlisted name still renders selected (never
  displays an unpersisted value); System default persists as `''`.
  Load failure degrades to System-default-only + hint. The 4vf
  Using-hint stays, reworded for picking instead of typing. Screens
  needed no changes (same `onChange({sinkName})` contract).
- Descriptor tag `input.sink` corrected `text` -> `dropdown` (table +
  pinned test; tooltip copy unchanged).
- Demo: `DeviceField.js` + `ModeDeviceScreen.js` mirrored verbatim;
  shim stub for the new route + value test + seam tripwire (same
  commit, per the shim-must-answer-every-route lesson).

## Live verification (this machine: PipeWire 1.0.5 + WirePlumber, `--fake-hue --fresh`)

- Endpoint returned the real sink
  (`alsa_output.pci-0000_00_1f.3.analog-stereo` / `Built-in Audio
  Analog Stereo`), matching `pw-dump`; descriptors show the dropdown
  kind.
- Dead end, filed as a lesson: bounding the enumeration with a
  `pw_loop` one-shot timer broke registry dispatch outright (sync Done
  arrived instantly with zero globals; added-but-disarmed worked).
  Bisected across arm order, interval nullness, and timespec lifetime;
  mechanism unknown. See "Arming a PipeWire loop timer can silently
  break registry enumeration on the same loop" in the input lessons.
- No browser: render path proven by a jsdom probe against the real
  `DeviceField.js` (22/22: lazy fetch, labels, both commit paths,
  unlisted-persisted selection, failure fallback, hints, refresh,
  video/non-Linux untouched). Probe at
  `/tmp/devicefield-67y-probe.mjs` (throwaway; no maintained JS
  harness in the repo).
- Suites green: input 70 assertions / 23 cases (4 new sink-list cases),
  app 67 / 20, all demo node tests. Note: `cmake`/`ctest` are not on
  PATH here, so C++ was rebuilt incrementally with captured
  compile/link commands (`flags.make`/`link.txt`) and the test
  binaries run directly -- including a stale-object catch (edited lib
  TU recompiled before relink).
- Pre-existing, untouched: `closure-check.mjs` already fails on HEAD
  (STALE `ZonePatchQueue.js`, `topBar.js`); no import changes in this
  bead, so the module graph from the entry is identical.
