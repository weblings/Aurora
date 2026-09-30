# Sink dropdown: fetch rework, chrome removal, 1.0.4

Id: audio-sink-dropdown-fetch-rework

Closed `Aurora-apn` (follow-up to `Aurora-4vf`/`Aurora-67y`): the sink
list loads on entering audio mode and refreshes on every dropdown open,
with a diff gate (`sinkOptionsEqual`) so steady-state opens show no
flicker or cursor jump. The Refresh button + row, load-status lines, and
Using-hint are gone; labels are description-only; the trigger re-syncs
to the selected row on every apply (it previously kept the raw persisted
node name after the list landed). `ModeDeviceScreen`'s hint-only status
fetch went with the hint; `DashboardScreen`'s poll stays (permission
banner).

## Diagnosis detour (AirPods missing from the list)

- Two stacked causes, neither the dropdown: the running binary (Sep 28)
  predated the routes (Sep 29), so `/api/linux/audio-sinks` 404'd into
  the System-default fallback (the stale-daemon lesson,
  "retesting after an edit against a running daemon"); and the AirPods
  sat at `bluez5.profile="off"` with no A2DP transport despite
  bluetoothctl `Connected: yes`. Selecting them in Sound settings
  acquired the transport; the endpoint then returned both sinks.
- Filed as an input lesson: Bluetooth "Connected" is not an audio
  transport. Trigger-sync filed as a components lesson.

## Toolchain + version

- System `cmake` is gone on this machine; the repo `.venv` ships pip
  cmake 4.4.3, used for configure + full rebuild. Noted on the
  toolchain-loss lesson as the first check before the manual path.
- Version bumped to 1.0.4 (`CMakeLists.txt` truth + demo-shim mirror;
  `CHANGELOG.txt` got the bare header only -- notes are the
  maintainer's). `/api/version` confirms `1.0.4`.

## Verification

- New `web/ui/DeviceField.test.mjs` (option rows + diff gate,
  prototype-called, no DOM) watched failing pre-change, green after;
  all 11 web suites green; vendor copies diff-identical; live endpoint
  returned built-in + `bluez_output.14_14_7D_E3_F5_98.1`.
