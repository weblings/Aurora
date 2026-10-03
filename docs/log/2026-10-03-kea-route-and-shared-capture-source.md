# Aurora-kea: route decision, shared capture-source scope, pending-highlight follow-up (paused, no code)

Id: kea-route-and-shared-capture-source

Second scoping pass on Aurora-kea (first: [[kea-dashboard-capabilities-scoping]]).
Still unstarted: no flag, accessor, route or UI change exists in code.

## Findings

- Visible bug today: `PUT /api/config` saves before reloading
  (`SettingsRoutes.cpp:155`). On `reloadError` the old pipeline keeps running,
  but `_switchMode`'s `_loadAll` re-derives mode from config, so the Dashboard
  shows the failed mode's sections. Kea fixes this.
- `reload()` while paused returns success without building (`Pipeline.cpp:399`),
  so "succeeded" alone is not "running".
- `pause()` moves the pipeline out and caches only monitors/zones
  (`Pipeline.cpp:446`). Flags read from the live pipeline would go all-false
  while paused and show the monitor picker to an audio user.
- First launch: `Pipeline::build` returns null until an input is set
  (`Pipeline.cpp:91-103`). The Capture source screen (`ModeDeviceScreen`)
  auto-applies Video on landing, so all-false lasts ~1s.
- `/api/capabilities` is a "compiled with" contract read lock-free by the 3s
  heartbeat, copied in three `app/*/main.cpp`. `/api/pipeline` doesn't exist.
- The two screens hold drifted copies of mode logic: Capture source saves mode +
  monitor + sink together and highlights before the apply; Dashboard saves mode
  only and highlights after.
- `DeviceField` hardcodes `/api/linux/audio-sinks` and renders one picker;
  `app.js` gates the Zone Mapping NUX step on `mode === 'video'`.
- `input.sink` is only a tooltip key, defined in `input/linux` alone; a missing
  key just drops the tooltip.
- The adapters (5ipy.10/.11) need kea for which source control to offer, not
  for the mode list (`/api/capabilities` inputs today, kep2 later).
- Three levels of "switch worked": saved; rebuilt and swapped (no
  `reloadError`, visible today); lights reacting (unchecked, planned as
  5ipy.2 health). Aurora-m2c fits the third.
- Corrected mid-session: an earlier kea note called the demo vendor copy stale
  and re-vendorable; the owner-confirmed fork lesson says otherwise.

## Owner decisions

- Route: option C, kea builds a minimal `GET /api/state` (paused + four flags,
  snapshot kept through pause); 5ipy.2 extends it. Only the minimal route is
  owner-approved; the rest of 5ipy.2 stays agent-proposed.
- Video/Audio and capture-source logic is shared between NUX and Dashboard:
  ModeDeviceScreen is in kea via one shared module.
- `input.sink` stays with Aurora-9k1.
- Pending highlight (outline on click, fill when confirmed, revert on failure)
  is a separate bead after kea.

## Changes

- Aurora-kea: description, acceptance and notes rewritten (route, shared
  module, DeviceField, probeState, pause, failed-switch, demo-fork correction).
- Filed Aurora-axoz (pending highlight, blocked by kea).
- Aurora-5ipy.2 depends on kea and extends its route; 5ipy.10/.11 reworded
  (mode list vs source controls; MQTT re-publishes discovery on flag change).
- Notes on Aurora-t9iq, Aurora-m2c (two leads), Aurora-d7s, Aurora-9k1.
- [[external-control]]: kea's minimal `GET /api/state` in phase 2; adapters
  take source controls from kea's flags, mode list from capabilities; MQTT
  re-publishes discovery on flag change.
- Lesson extended: 'Diff a live change against what the running thing was built
  from, not against the persisted copy' now covers the WebUI case.

## Resume

Start kea from its acceptance. Before porting into the demo fork, diff the
vendored DashboardScreen/TuningFields and ask why heartbeat/audio-status poll
are absent.
