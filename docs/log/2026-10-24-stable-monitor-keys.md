# 5ipy.27: stable monitor keys (Aurora-5ipy.27)

Id: stable-monitor-keys

Open. Plan A8 in [[api-v1-plan]]. Code is in (b3d09d0), hardware checks are not.

## Shipped

- `MonitorData.key`, empty when a grabber has none. Set by each grabber:
  - Windows: `monitorDevicePath` from `DisplayConfigGetDeviceInfo`, matched to the output by GDI name.
  - Mac: `CGDisplayCreateUUIDFromDisplayID` as a UUID string.
  - X11: FNV-1a hash of the output's EDID property, `@` connector name. Empty without an EDID.
- `selectConfiguredMonitor` matches `key` first, then `name`, so a saved pre-key name still resolves. Saved values
  are not rewritten: `activeMonitorName` holds whatever the dropdown last saved.
- `GET /api/monitors` entries gain `key`, and the response gains `canSelectMonitor` (true when the list is
  non-empty, so false on Wayland where the portal picks).
- `DeviceField` saves `key || name` and marks an entry selected when the saved value is its key or its name.

## Audio sink ids (code read, no hardware)

- Linux saves the PipeWire `node.name`. Stable per device, but USB names embed port or serial, so a new port may
  rename it.
- Windows is default-device loopback only (`pDeviceID` null), nothing saved. Mac taps the default output by
  CoreAudio UID, nothing saved. Only Linux has a saved sink id.

## Verification

- Core suite 439/439 (new case selects by key), Windows grabber compiles, `DeviceField` web test passes.
- Not done: Mac and X11 builds, drift repro per platform, key survival across primary change, replug and reboot.
  These are the remaining acceptance work.
