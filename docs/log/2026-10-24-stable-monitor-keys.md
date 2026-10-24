# 5ipy.27: stable monitor keys (Aurora-5ipy.27)

Id: stable-monitor-keys

Open. Plan A8 in [[api-v1-plan]]. Code is in (b3d09d0, follow-ups 9975baf to fa1005a), hardware checks are not.

## Shipped

- `MonitorData.key`, empty when a grabber has none. Set by each grabber:
  - Windows: `monitorDevicePath` from `DisplayConfigGetDeviceInfo`, matched to the output by GDI name.
  - Mac: `CGDisplayCreateUUIDFromDisplayID` as a UUID string.
  - X11: FNV-1a hash of the output's EDID property. `@` connector is added only when two outputs share an EDID
    (Aurora-5ipy.29). Empty without an EDID.
- `selectConfiguredMonitor` matches `key` first, then `name`, so a saved pre-key name still resolves. A name match
  on a monitor with a key is rewritten to the key on disk by `Pipeline::build`, unless a newer pick landed during
  the build (Aurora-5ipy.30).
- `GET /api/monitors` entries gain `key`. `canSelectMonitor` is in `/api/capabilities`, fixed per host: false only
  on the Linux Wayland/portal backend (Aurora-5ipy.31).
- Known edge: with two identical X11 monitors (same EDID), plugging or unplugging one changes the other's key
  between `hash` and `hash@connector`. The saved key then misses and the primary is used until the user picks again.
- `DeviceField` saves `key || name` and marks an entry selected when the saved value is its key or its name.
  `TuningFields` resolves the saved value the same way (Aurora-5ipy.28).

## Audio sink ids (code read, no hardware)

- Linux saves the PipeWire `node.name`. Stable per device, but USB names embed port or serial, so a new port may
  rename it.
- Windows is default-device loopback only (`pDeviceID` null), nothing saved. Mac taps the default output by
  CoreAudio UID, nothing saved. Only Linux has a saved sink id.

## Verification

- Core suite 439/439 (new case selects by key), Windows grabber compiles, `DeviceField` web test passes. After the
  follow-ups: Windows core 442/442 with the `Pipeline::build` migration cases, `TuningFields` web test passes,
  [[lane-a-review-followups]].
- Not done: Mac and X11 builds, drift repro per platform, key survival across primary change, replug and reboot.
  These are the remaining acceptance work.

## Windows hardware pass (2026-10-24)

Three monitors (ASUS VG289Q1A, Dell U2415, LG TV), live `windows` input, fake-Hue stack, the app relaunched
against one config dir between steps. The saved choice was the Dell, not the primary.

| Step | Dell's GDI name | Result |
|---|---|---|
| Saved legacy name `\\.\DISPLAY12` | DISPLAY12 | Pass: rewritten to the key on disk, Dell captured |
| App restart | DISPLAY12 | Pass |
| LG TV extended, Windows made it primary | DISPLAY12 | Pass: covers a primary change |
| Dell replugged, same port | DISPLAY12 | Pass, but the name held, so name matching would also pass |
| Dell moved to another port | DISPLAY12 | Fail: key `UID4355` became `UID4358`, capture fell to the primary. Fixed by Aurora-5ipy.35, below |
| System reboot | DISPLAY1 | Pass: all three names renumbered (12/13/14 to 1/2/3), the key held |
| After Aurora-5ipy.35: saved pre-fix key `UID4358` | DISPLAY1 | Pass: resolved through the alias, rewritten to `136651509893c1ff` |
| After Aurora-5ipy.35: Dell moved to another port (`UID4358` back to `UID4355`) | DISPLAY1 | Pass: key unchanged, Dell captured |

- Drift is real on Windows: a reboot renumbers every `\\.\DISPLAYn`, so name-only matching would have lost the
  pick. The port move is the opposite case: the key changes and the name holds.
- Aurora-5ipy.35: the Windows key is now an FNV-1a hash of the monitor's EDID (registry `Enum\DISPLAY\<hwid>\<instance>\Device
  Parameters\EDID`), so it no longer embeds the port. The old device path stays in `MonitorData.altKeys`, still resolves a
  saved value and is rewritten to the key. A monitor with no EDID keeps the device path as its key. Identical EDIDs get
  `hash@devicePath`, so only that rare case still depends on the port. The key helpers moved to core
  (`Aurora/Input/MonitorKey.hpp`), X11 uses them through a forwarding header (not built on Linux yet).
- The running app does not see an added or moved monitor until a rebuild. Filed per platform for 1.1.4:
  Aurora-ecl5 (Windows), Aurora-h06o (Mac), Aurora-9fn3 (X11).
