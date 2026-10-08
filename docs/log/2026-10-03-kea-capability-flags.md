# Aurora-kea: running-pipeline flags drive the Dashboard (open: Mac/Windows unverified)

Id: kea-capability-flags

Builds on [[kea-route-and-shared-capture-source]]. Linux-verified; Mac and
Windows not built or viewed.

## Built

- Core: `PipelineCapabilities` (`usesVideoInput`, `usesAudioInput`,
  `samplesZones`) from `Pipeline::capabilities()`. `PipelineHost` keeps a
  snapshot in one `std::atomic<uint8_t>`, stored on the reload swap, on
  resume and in the constructor; pause and failed reloads leave it alone.
  `PipelineOptions::audioDevicesUrl` (Linux: `/api/linux/audio-sinks` when
  audio is compiled in). `GET /api/state` sits in `registerStateRoute` next
  to the PUT, lock-free.
- `web/ui/CaptureSource.js`: mode helpers, `effectiveFlags`, `devicePatch`,
  `modeSwitchPatch`, `loadPipelineState`; used by DashboardScreen,
  ModeDeviceScreen and `app.js` probeState.
- Dashboard sections follow the running flags. All-false falls back to the
  config's mode (today's behavior; a fresh install gets the monitor picker),
  not a hard-coded monitor picker: a failed build at launch in audio mode
  keeps the audio sections, as before.
- The Capture source screen shows the user's choice (`flagsForMode`), not
  what runs: it is the chooser and highlights before applying.
- DeviceField renders from flags (both pickers when both true, no wrappers so
  a single picker's DOM is unchanged); its device list URL comes from
  `audioDevicesUrl`. TuningFields saves each running input's keys; its field
  set stays two-way (Aurora-jpq2).
- Toggle highlight still reads config, so after a failed switch the toggle and
  the sections disagree until Aurora-axoz.
- Demo fork: feature port only (owner, per Aurora-4jl). `CaptureSource.js`
  and the new `DeviceField.js` copied verbatim (the fork's DeviceField matched
  web/ui); Dashboard and TuningFields hand-ported. Shim derives `/api/state`
  from its config; value test and seam checks added. The vendored
  `ModeDeviceScreen.js` is now imported by nothing.

## Verification

- Core ctest 162/162, linux-app ctest 105/105. New core tests fail when the
  reload-swap store is removed. No-audio build: one pre-existing c0g failure
  (Aurora-ryvy), none from kea.
- `web/ui` and `web/demo` node tests pass, incl. new `CaptureSource.test.mjs`.
- `app.js` equivalence: HEAD vs new against stub screens, 384 boot scenarios
  with `/api/state` consistent with config: identical traces; a variant with
  `samplesZones` forced false changes the 16 Zone Mapping scenarios.
- Live (`build/linux-app/bin/Aurora --fake-hue`, `dummy` input, fake bridge):
  `/api/state` correct through audio switch, failed switch (config `nope`,
  flags still audio), pause (flags kept), switch while paused (flags unchanged
  until resume).
- Screenshots via headless Chromium: video Dashboard pixel-identical to HEAD's
  UI; audio differs only in the Zone Mapping line ("screen capture running").

## Not verified

Mac/Windows compile and screens; the Capture source screen in a browser (it
auto-starts real capture, which opens a portal dialog).

## Lessons

Extended, not added: headless-shell screenshots and HEAD pixel-diff
(web-testing), stale-binary recurrence (debugging-method), fork tooling vs
Aurora-4jl (architecture-process).

## Resume

Build and view the Dashboard on Mac and Windows (both modes), then close kea.
Follow-ups: Aurora-axoz, Aurora-ifkn, Aurora-ryvy.
