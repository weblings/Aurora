# WebUI fixes

Tracks the gap between an AI-built pass and a human sitting down and using
it, found by hands-on use after each pass's own build order closes out —
one section per pass, so a pass's hands-on findings never get filed against
the wrong build. `WebUI_Design_1stPass.md`'s original 19-step build order
lives on its own now; `WebUI_Design_2ndPass.md` holds the accordion
Dashboard + NUX redesign this doc's own Pass 1 findings led into.

Keep entries short: what's wrong, why it matters, a proposed fix if one's
obvious. Full investigation/fix details belong in the commit or PR that
closes the task, not here — see `Analysis/lessons/engineering-hygiene.md`'s
entry on build-log doc density for why.

## Pass 1

Follow-up to `WebUI_Design_1stPass.md`. That doc's 19-step build order is
done and each screen passed its own jsdom/live verification, but "verified"
isn't the same as "actually usable."

### Open tasks

- [x] **Menu redesign.** Dashboard's four separate screens (Bridge/Capture
  source/Zones/Tuning) collapse into an accordion under one persistent
  Dashboard, informed directly by huenicorn's own single-page priority
  ordering (canvas+gamma, then entertainment config, then channel list all
  always visible; only "Advanced settings" collapsed). Cuts the dead
  Settings button/modal entirely — no real content ever lived there, and
  huenicorn has no gear icon either. Folds Capture Source away completely
  (its only real content, one device field, moves to a shared top-tier slot
  that swaps between a monitor dropdown and a sink field depending on
  mode). Also closes out the Back-button task above as part of the same
  pass (`OutputConnectScreen`'s "already connected" state). See
  `WebUI_Design_2ndPass.md` for the full design discussion — the
  tabs-vs-accordion comparison against `RockyRoadImport`, the final ASCII
  layouts (collapsed/expanded × video/audio), and the onboarding (NUX)
  redesign that leads into this menu — and its own "Scoping + sequencing"
  section for the build order once that's written.
- [x] **Fixed: fresh install — HTTP server never binds, and even once it did,
  onboarding couldn't reach Output Connect.** Two stacked bugs, not one:
  (1) `Pipeline::build()` threw when zero outputs were registered, before
  `httpServer.bind()` ran, so nothing listened on the port at all (confirmed
  live: deleting `%APPDATA%\Aurora` and relaunching printed a fatal error).
  (2) Even after fixing that, `/api/capabilities`' `outputs` list came
  straight from `registry.outputNames()`, and `registerOutputs()` only adds
  `"hue"` to that registry once credentials are *already* configured —  a
  chicken-and-egg gate. `app.js`'s `hasHue` and `DashboardScreen`'s Bridge
  row both read that same list to mean "is Hue compiled into this build,"
  so a genuinely fresh install would see `hasHue: false`, skip Output
  Connect entirely, and land on a Dashboard with the Bridge row permanently
  disabled ("not available in this build") — no path to pairing at all.
  Root-caused by asking "what's the intended new-user flow?" instead of
  accepting the crash fix alone as done.
  **Fix (1):** output-agnostic, not Hue-specific — `main()`'s initial
  `Pipeline::build()` call is now wrapped in try/catch (matching how
  `PipelineHost::reload()` already treated a failed rebuild as recoverable),
  and `PipelineHost` now tolerates holding no `Pipeline` at all
  (`tick()`/`shutdown()` no-op, `listMonitors()`/`listZones()` return empty,
  `updateZone()` returns false) until a reload — e.g. after pairing
  completes — first succeeds. Matches huenicorn's separate-setup-server
  pattern.
  **Fix (2):** `registerCapabilitiesRoute()`'s `outputs` list now always
  includes `"hue"` when `AURORA_OUTPUT_HUE_IO_AVAILABLE` is compiled in,
  independent of `registry.outputNames()` — matching the route's own
  documented contract ("compiled with," not "already paired").
  `registerOutputs()`'s Pipeline-facing registration is untouched (still
  conditional on configuration, so an unpaired boot doesn't try to init a
  bogus Hue connection).
  Confirmed live end-to-end with `%APPDATA%\Aurora` deleted:
  `/api/capabilities` now reports `outputs: ["hue"]`, `/api/hue/connection`
  reports `configured: false`, which is exactly what `app.js`'s
  `probeState()` needs to route a fresh install to Output Connect first —
  Output Connect → Mode+Device → Zone Mapping → Tuning → Dashboard, with
  the existing `onConnectionChanged` reload callback building the first
  real `Pipeline` once pairing completes. Applied identically to
  `Aurora-App-Windows` and `Aurora-App-Linux` (both rebuilt clean, Linux
  verified via WSL2).
- [x] **Pairing persistence — resolved, not a real bug.** Live repro with
  temp `[pairing-debug]` logging confirmed the full flow (validate →
  register retry after button press → entertainment configs → save) works
  and persists correctly. Earlier "never saved" reports were real attempts
  that likely never completed the register retry, not a persistence bug.
  Debug logging since stripped from `CredentialsStore.cpp`/
  `PairingRoutes.cpp` (the `configRoot` line in `main.cpp` stays until the
  double-click crash below is root-caused).
- [ ] **No way to discover the WebUI's URL.** (→ bd Aurora-2qj) Root cause found: the printed
  line was `config.boundBackendIP()` verbatim, which defaults to `"0.0.0.0"`
  — a bind-all address, not something a browser can reliably navigate to
  (behavior varies by browser/OS, matching the flaky "0.0.0.0 worked/didn't
  work" reports). Fix in progress: `browsableAddress()` substitutes
  `127.0.0.1` for that case; auto-launch the browser on first setup only,
  print a clickable link (not auto-launch) otherwise. Same bug existed
  identically in both `Aurora-App-Windows` and `Aurora-App-Linux`.
- [ ] **Back navigates to the previous onboarding *step*, which is correct,
  but the step it lands on doesn't show what you already did there.** (→ bd Aurora-mqi)
  Original report: Back from Tuning (audio mode, mistaken for the
  Dashboard) returned to Output Connect, several steps earlier than
  expected. Root cause found in a later pass: chain-level Back is already
  correct as "literal previous screen in sequence" — the actual bug is that
  `OutputConnectScreen` always mounts into its blank entry form regardless
  of whether a connection is already saved, so going back after already
  pairing looks and behaves like starting over (worse: continuing from
  there re-runs `_register()` for real, silently demanding the physical
  link button be pressed again). Fix: `OutputConnectScreen.mount()` checks
  for an already-configured connection first and renders a "Connected to
  `<address>` — Change bridge" status phase instead of jumping straight
  into pairing; Back itself needs no change. Applies identically whether
  reached via chain Back or via Dashboard's own Bridge row.
  **Note:** this will likely get fixed as a byproduct of the NUX redo
  rather than as its own standalone change — see `WebUI_Design_2ndPass.md`'s
  "New user setup flow (NUX) redesign" section, which redraws every
  onboarding screen with a consistent Back/Continue footer and works
  through this exact Connected-state question directly.
- [x] **Fixed: clicking a Dropdown entry looked broken but wasn't.**
  `Dropdown._commit()` closed the menu and called the caller's `onSelect`,
  but never updated its own trigger label or `aria-selected` — the
  committed value was always correct (confirmed via the real PUT/POST body
  sent) but the label never visibly changed, indistinguishable from a
  broken click. Fixed in `Dropdown.js`; regression coverage added to
  `dropdown_test.mjs`. Neither real call site (`OutputConnectScreen`,
  `ModeDeviceScreen`) needed changes — both already just stash the value.
  Re-reported as still broken once — served file confirmed correct via
  direct curl; likely a stale ES-module cache in an already-open tab, not
  reopened as a task unless a hard-refreshed repro still shows it.
- [x] **Fixed: entertainment config pickable without redoing physical
  pairing.** `OutputConnectScreen` had no path to `configSelect` except the
  full `entry → pairing → configSelect` sequence, even with valid
  credentials already saved. Matches huenicorn's own real design
  (`WebUI.js`'s entertainment-config `<select>` lives on its main
  zone-mapping page, decoupled from setup) — added the picker to Zone
  Mapping instead of special-casing Output Connect, hidden at exactly one
  config same as elsewhere. `POST /api/hue/connection` is now merge-style
  (PATCH), same convention `/api/config`/`/api/zones` already use, since
  the frontend never has `username`/`clientkey` to resend a full body;
  `PUT /api/hue/entertainment-configurations` falls back to the persisted
  connection when the body omits bridgeAddress/username. Verified live
  against the real bridge (switched "TV area" → "TV" and back with no
  re-pairing); jsdom regression coverage added to `zone_mapping_test.mjs`.
  `[pairing-debug]` logging stripped from `PairingRoutes.cpp`/
  `CredentialsStore.cpp` now that the persistence question is resolved
  (the `configRoot` line in `main.cpp` stays until the double-click crash
  is root-caused).
  **Update:** the "verified live" claim above only checked that the switch
  persisted, not that it took visible effect — real gap found afterward:
  `registerOutputs()`'s Hue factory closed over `HueConnection` by value at
  registration time (main.cpp, both apps), so switching configs never
  changed which channels the *running* output actually reported; the zone
  canvas kept showing whichever config was loaded at boot (one zone
  "TV"-shaped instead of the seven-light "TV area" set). Fixed: the factory
  now re-reads `CredentialsStore` fresh on every call, and
  `registerPairingRoutes` gained an `onConnectionChanged` reload callback
  (same convention as `SettingsRoutes`' `onConfigChanged`), called after
  `POST /api/hue/connection` saves. `ZoneMappingScreen._setEntertainmentConfig`
  also now re-fetches `/api/zones` after a successful switch instead of only
  updating the picker's own label. Re-verifying surfaced a further UI gap
  (occluded/unselectable zones) — see "Zone Mapping: channel selection &
  identification" below for the full follow-up plan, confirmed working live.
- [ ] **No single-instance enforcement — a second launch can silently run
  headless.** (→ bd Aurora-52o) `httpServer.bind()` failing (port in use) just logs to
  stderr and the process keeps running with no WebUI at all; nothing tells
  the user which of possibly several running copies is the real one. Real
  design constraint: must scope the lock to the resolved config root, not
  globally — this session's own testing runs multiple instances at once
  against different `AURORA_CONFIG_DIR`s, and a real future setup might
  legitimately run two instances for two different bridges. A named mutex
  derived from the config-root path, not a global one. Related: a
  double-click-launched console closes instantly on exit, so even a
  correct error message is never seen — worth fixing together (log to a
  file, or keep the window open on error).
- [x] **Fixed: live Video→Audio mode switch — light silently stopped
  responding.** Root-caused via live `[audio-debug]`/`[hue-debug]` logging:
  audio capture and processing were working correctly the whole time (real,
  changing samples/colors every tick) — the bug was that
  `PipelineHost::reload()` builds the new pipeline (including starting its
  stream) fully before tearing down the old one, and `HueOutput::shutdown()`
  unconditionally sent an authoritative "stop streaming" call for its
  entertainment config. When old and new outputs share the same config (the
  common case — same bridge, same "TV area"), that late stop silently killed
  the brand-new stream at the bridge, while every local signal
  (`isConnected()`, computed colors) kept reporting healthy. Not Hue-specific
  in cause (any output plugin with external session state could hit the same
  race) — fixed at the `IOutput` interface: `shutdown()` now takes
  `isReplacement`, and only a real app exit (not a reload) tells Hue to
  actually stop the bridge-side stream. `Aurora-Output-Hue`'s test suite (94
  assertions) still passes after both the fix and the debug-logging cleanup.
  Confirmed fixed live. Temp `[audio-debug]`/`[hue-debug]` logging stripped
  from `AudioGrabber.cpp`, `AudioOrchestrator.cpp`, `HueOutput.cpp`,
  `ApiTools.cpp`, and both apps' `main.cpp` (the `[pairing-debug]`
  `configRoot` line in `main.cpp` stays until the double-click crash is
  root-caused).
- [ ] **Autodetect needs two clicks to work.** (→ bd Aurora-07i) Root cause found, not yet
  fixed: `HttpClient.cpp`'s `sendHttpRequest` hardcodes `CURLOPT_TIMEOUT` to
  1 second for every outbound call this module makes, including
  `ApiTools::autodetectedBridge()`'s call to `https://discovery.meethue.com/`
  — a real internet round trip (DNS + TLS + response), unlike every other
  caller of this function, which talks to a bridge on the local LAN. 1s is
  short enough to plausibly miss on a cold connection and succeed on retry,
  which is exactly the reported symptom. Already flagged once before in
  `Analysis/lessons/engineering-hygiene.md`'s live-E2E-test entry, but only
  worked around there in a *test's* wait time — never fixed at the source.
  Fix: give this one call (only this one — local bridge calls should keep
  failing fast) a longer timeout, e.g. 5s.

### Zone Mapping: channel selection & identification

Follow-up to the entertainment-config task above. Root cause of "zone 5 hid
zone 4": every zone with no saved mapping defaults to the exact same
full-canvas UV rect (`ZoneReconciler`/`ZoneConfig`'s default), so their
outlines, tags, and click targets all land on the same pixels — the topmost
DOM element eats every click, the others become unreachable.

Items 1-7 built and confirmed live. Some visual nits noted for follow-up,
not yet itemized here.

1. [x] Removed the on-canvas per-zone checkbox; kept the bare zoneId label
   (already rendered for every zone, not just the selected one).
2. [x] Added a zone-selector dropdown (same `Dropdown.js` component as the
   entertainment picker) as the primary way to choose which zone is being
   shape-edited/gamma-tuned, decoupled from clicking the canvas. Canvas
   click still works too, as a shortcut.
3. [x] Added a separate active/inactive toggle list below the canvas+gamma
   block, one row per zone, reusing the existing `.toggle-row`/
   `.toggle-switch` pattern (`forms.css`) — not huenicorn's two-column
   drag-and-drop, which solves an open-ended bridge-light-membership
   problem Aurora's fixed zone count doesn't have. Fully decoupled from
   which zone the dropdown/canvas has selected.
4. [x] Fixed `_renderCanvas`'s paint order: zones used to draw in array
   order regardless of selection. Now the selected zone always paints
   last (on top), so picking it from the dropdown reliably surfaces its
   shape/handles even when another zone's rect covers the same region.
5. [x] Zone Mapping now always has a real selection on load (defaults to
   the first zone) instead of starting with none selected, matching the
   entertainment dropdown's always-a-value behavior.
6. [x] Wired `ApiTools::matchDevices`/`parseEntertainmentConfigurationsChannels`
   (already ported and unit-tested, never called from the live path) into
   `loadEntertainmentConfigurations()`, and added `GET /api/hue/channels`
   so the dropdown and toggle list show real light names ("Zone 5 (Floor
   Lamp)") instead of bare numbers where the bridge has them.
   **Side effects found along the way:** `Dropdown.js` itself had a latent
   bug — option matching compared `dataset.value` (always a string)
   against the option's raw value, so a numeric value (zoneId) silently
   failed to select on click; fixed with a `String()` coercion. Rewriting
   the jsdom tests to cover the entertainment-config-switch flow with a
   stateful mock (matching how the real persisted connection actually
   behaves) also confirmed last session's "not yet re-verified live"
   reload fix genuinely works end to end. Verified via jsdom
   (`zone_mapping_test.mjs`) and the `Aurora-Output-Hue` unit suite (94
   assertions), then confirmed live.
7. [x] Verification pass: backed up the live (all-default, all-inactive)
   `hue.json`, dropped in a real prior zone layout for the test, confirmed
   the UI rendered it correctly. No migration path exists from huenicorn's
   old config format (checked, none found) — a fresh Aurora config always
   starts with every zone defaulted to the full-canvas rect, which is why
   they all rendered identically before any manual dragging.

## Pass 2

Empty until `WebUI_Design_2ndPass.md`'s accordion Dashboard + NUX redesign
actually ships and hands-on nits start coming in from using it — not
pre-populated, matching how Pass 1's own section above didn't exist until
after its build order closed out.

### Open tasks

- [x] **Fixed: fresh onboarding — Mode+Device Save reloadError'd "No outputs
  available -- nothing to drive."** (This was true in Pass1 as well) `registerOutputs()` only ever registers
  `"hue"` into `Registry` once, at daemon startup, gated on whatever
  `CredentialsStore` held *then*. Pairing through Output Connect/
  Entertainment zone select in that same running session persists real
  credentials, but never touched `Registry` — so `Pipeline::build()`'s next
  reload (Mode+Device Select's own save) still found zero registered
  outputs and threw, even though pairing had just succeeded seconds
  earlier. `/api/capabilities`'s own `outputs` list already had a patch for
  a related but distinct symptom (Pass 1, above) — that only fixed what the
  frontend's onboarding *gate* sees, not what `Pipeline::build()` can
  actually construct. **Fix:** `onConnectionChanged`'s callback (both apps'
  `main.cpp`) now calls `registerOutputs(registry, configRoot)` again,
  right before reloading — `Registry::registerOutput()` is a plain map
  assignment, safe to repeat, and this is the one thing that was actually
  missing.
- [x] **Fixed: Entertainment zone select — Test Pulse always failed with
  "Couldn't reach the daemon."** The daemon wasn't actually unreachable —
  `ApiTools::testPulse` was passing entertainment-service rids
  (`channels[].members[].service.rid`) straight to
  `/clip/v2/resource/light/{id}`, which only recognizes *light*-service
  rids — a different id space on a real bridge (confirmed against
  huenicorn's own real `Runtime.cpp`, which resolves this via
  `loadDevices()` + `matchDevices()` rather than ever mixing the two
  spaces). The mismatched id 404'd with an empty `data` array,
  `parseLightSnapshot`'s `.at("data").at(0)` threw uncaught, and
  cpp-httplib's default exception handling returned a non-JSON 500 body —
  which the WebUI's own `fetch().json()` then reported as "couldn't reach
  the daemon," masking a request the daemon had actually handled. The same
  id-space bug also meant `loadEntertainmentConfigurations`'s per-channel
  `matchDevices()` call (matching channel members against
  `light_services`-derived placeholders) could never produce a real match
  on an actual bridge — `/api/hue/channels`'s "Zone N (light name)" labels
  were silently always falling back to bare "Zone N" too, not just Test
  Pulse. Every existing unit test for this passed regardless, because their
  fixtures happened to reuse the same id strings across both spaces by
  convenience, not by checking the real API. **Fix:** `Device` gained a
  `lightId` field (the sibling `light`-rtype service on the same device,
  captured in the same `/clip/v2/resource` pass `parseDevicesFromResource`
  already made); `loadEntertainmentConfigurations` and the test-pulse route
  both resolve entertainment-rid → `Device.lightId` via `loadDevices()` +
  `matchDevices()` before touching `/clip/v2/resource/light/{id}`, matching
  huenicorn's real wiring; the now-provably-wrong `light_services`-based
  placeholder path was removed rather than patched around. Also wrapped the
  test-pulse route's bridge calls in a try/catch returning a clean JSON
  error, and made a single bad light's snapshot-parse failure skip that
  light instead of aborting the whole pulse — both were already the stated
  intent of an existing comment, just not actually implemented.
  **Follow-up:** still unreliable in a live retest after this fix, cause
  not yet root-caused further. Since it's a nice-to-have, not load-bearing
  for onboarding, `EntertainmentZoneSelectScreen`'s own Test Pulse button
  is omitted for now rather than blocking on it — backend route/ApiTools
  fix above stays in place, easy to re-add the button once revisited.
- [x] **Fixed: live crash — `WindowsGrabber` asserted
  `cv::Mat::Mat`'s `_step >= minstep` and took down the whole daemon.**
  `grabFrameSubsample()` cached its D3D11 staging texture forever after
  first creation and never re-checked it against the live frame's own
  size/format on later ticks — if a later `AcquireNextFrame` ever returned
  a differently-sized/formatted texture, copying it into the stale-sized
  staging texture and reading its `RowPitch` back could produce a step
  smaller than the new frame's own row size, which `cv::Mat`'s row-step
  constructor asserts on. **Fix:** the staging texture is now recreated
  whenever its own dims/format drift from the current frame, and
  `RowPitch` is independently re-verified against the actual frame size
  right before either `cv::Mat` construction — logging and skipping just
  that one frame (matching every other transient-failure branch already in
  this function) if it's ever still off, instead of crashing.
- [x] **Fixed: fresh onboarding — lights started reacting to Video during
  Entertainment zone select, a full screen before Mode+Device Select ever
  ran.** `Pipeline::build()` has always defaulted to `"windows"` video
  input whenever `activeInputName` was empty (a leftover from this file's
  pre-onboarding, test-script-only origin) — harmless before today only
  because a fresh install had no registered outputs yet, so every early
  reload already failed with "no outputs available" regardless of what the
  input would have defaulted to. The `registerOutputs()` re-registration
  fix above made that early reload start *succeeding*, which is what
  actually surfaced this: a reload right after pairing now built a real
  video pipeline nobody had asked for yet. **Fix:** `build()` returns
  `null` (an already-tolerated idle state, not an error — see
  `PipelineHost`'s own constructor comment) when neither `activeInputName`
  nor `activeAudioInputName` has ever been set, instead of defaulting.
- [ ] **Capture source (Mode+Device Select) — lights don't visibly react
  immediately after Save, but do by the time Zone Mapping is reached.** (→ bd Aurora-vf1)
  Not yet root-caused. Candidate explanation, not confirmed: Mode+Device's
  save does trigger a real reload with a real input this time (unlike the
  entertainment-zone-select case above), so this may just be DTLS
  handshake/entertainment-stream-activation latency on the bridge side
  that resolves itself within the few seconds it takes to navigate to the
  next screen, not a real gap in the reload path. Needs a live pass timing
  how long after Save the bridge actually starts rendering, not more code
  reading.
- [ ] **Dashboard — switching Video/Audio with the mode toggle doesn't
  actually change what the lights are doing.** (→ bd Aurora-m2c) Not yet root-caused, but
  likely related to the *same* class of bug `HueOutput::shutdown()`'s own
  comment already documents fixing (a reload's old instance sending an
  authoritative bridge-side stop that kills the new instance's
  already-established stream, since `PipelineHost::reload()` deliberately
  builds the replacement before tearing down the old one) — `shutdown()`
  itself only sends that stop on a real app exit now, but
  `EntertainmentConfigurationSelector::selectEntertainmentConfiguration()`
  has its *own*, separate `disableStreaming()` call when the bridge
  reports the target config already streaming (`EntertainmentConfigurationSelector.cpp:76-78`)
  — exactly the situation a mode-switch reload creates, since the new
  instance's `init()` runs while the old one is still actively streaming
  that same config. Worth checking live (temporary logging around both
  `Streamer`'s connection lifecycle and this stop/start pair) before
  changing anything — this is a guess from reading the code, not a
  confirmed root cause, and the reload-ordering tradeoff it would touch
  was itself a deliberate choice for other outputs' sake.
  **In progress:** temporary `[hue-mode-switch]` stderr logging added
  (`ApiTools::setStreamingState`/`streamingActive`, both
  `EntertainmentConfigurationSelector::selectEntertainmentConfiguration()`
  call sites, `HueOutput::init`/`shutdown`, and `Streamer`'s previously-
  swallowed `DtlsClient::init()` exception) to distinguish this hypothesis
  from an alternate one found while reading the code for this: the second
  `disableStreaming()` firing during the *new* instance's own `init()`
  could itself be racing the new `Streamer`'s DTLS handshake for the same
  entertainment config, causing the handshake to silently fail (swallowed
  per this repo's own documented convention) rather than the bridge-level
  stop simply outliving the switch. Needs a live mode-switch with the
  daemon's stderr captured to tell these apart. **Live result:** both
  transitions in a video->audio->video test fired the selector's
  `disableStreaming()` cleanly (no errors), and the audio->video leg (done
  from the Dashboard) was reported stable -- weakens this hypothesis, no
  live failure caught yet. Logging left in place for the next repro.
- [x] **Not a bug: "Audio mode never visibly engages."** Root-caused live
  via the `[hue-mode-switch]` logging in `AudioOrchestrator::update()` and
  `AudioGrabber`: the loopback device started fine (`sampleRate=48000`)
  both times, but `AudioOrchestrator` correctly logged `no audio samples
  yet` because nothing was actually playing through the default output
  device at the time -- WASAPI loopback captures silence/nothing when
  there's no active render session, not a bug in this repo. Confirmed on
  retest: with audio actually playing, `first non-empty buffer` logged
  immediately and the lights reacted normally. `AudioOrchestrator::update()`'s
  early-return-on-empty-buffer behavior is correct as designed. Diagnostic
  logging left in place (cheap, and useful if this class of report recurs).
- [x] **Fixed: Capture source (Mode+Device) screen — neither video nor
  audio visibly activated until Zone Mapping loads.** An earlier pass at
  this wrongly concluded it was fully explained by DTLS handshake
  latency alone; corrected after the user pointed out the report is a
  precise causal tie to Zone Mapping's own load, not vague background
  timing. Re-examined with real numbers instead of assuming: comparing the
  `PUT /api/config handler took Xms total` log against `Streamer: first
  streamChannels() call, Yms after construction` across three live
  reloads, Y consistently exceeded X by seconds (2103ms, 3468ms, 485ms) --
  meaning a real, separate, variable-length gap exists **after** the HTTP
  request (and therefore the frontend's `await fetch()` and screen
  transition) had already completed, on top of whatever the handshake
  itself cost. Confirmed via `ModeDeviceScreen.js`: its Save handler does
  `await fetch('/api/config', ...)` and only navigates to Zone Mapping
  once that resolves -- so the handshake portion genuinely does block the
  screen transition, but doesn't account for the whole delay. Found a
  second, likely bigger contributor while re-reading `Orchestrator::update()`:
  its own doc comment already says "No-ops if the input hasn't produced a
  frame yet" -- the exact same silent-early-return shape as
  `AudioOrchestrator::update()`'s empty-buffer case that explained the
  (separate, now-closed) audio-silence report. If `WindowsGrabber`'s first
  real captured frame is itself delayed (DXGI duplication cold-start,
  desktop-duplication only delivering a frame on screen change, etc.),
  `Orchestrator::update()` would silently no-op the same way `AudioOrchestrator`
  did -- and this would apply to **audio's own pipeline too**, once its own
  first-frame latency is measured, since both call the same `HueOutput::send()`.
  **Added:** all `[hue-mode-switch]` logs across every file now share one
  wall-clock timestamp (`[t=Xms]`, `_dbgMs()`) instead of each having its
  own private relative clock, so the next capture can be read directly
  without reconstructing offsets by hand (a mistake made in this same
  investigation). Also added: `Streamer` now logs immediately before/after
  the handshake call itself (isolating handshake duration precisely,
  separate from everything else `HueOutput::init()` does), and
  `Orchestrator::update()` gained the exact same instrumentation
  `AudioOrchestrator::update()` already had (first `update()` call,
  throttled "no frame data yet," first real frame) so video's own
  first-frame latency can finally be measured instead of assumed.
  **Actually root-caused, and it wasn't the timing chain above at all:**
  `ModeDeviceScreen.js` used a deferred-apply model -- clicking Video/Audio
  only updated local UI state, and nothing was sent to the backend until
  Continue was clicked. Landing on the screen genuinely didn't connect
  anything, and clicking Audio genuinely didn't start anything, by design,
  not by any latency in the reload/DTLS/capture chain (all of which was
  real, correct instrumentation work, just aimed at the wrong layer -- see
  `Analysis/lessons/web-ui.md`'s new entry on this). **Fix:** rewrote
  `ModeDeviceScreen.js` to apply mode/device changes live -- on landing (if
  nothing valid is configured yet) and on every mode click, matching the
  live-apply model `DashboardScreen`'s own device controls already used
  elsewhere in this codebase. Continue is now pure navigation. All the
  `[hue-mode-switch]` diagnostic logging above was reverted afterward
  (throwaway instrumentation, not meant to ship) -- kept here only as the
  record of what was tried and why it didn't find the real cause.
- [x] **Fixed and confirmed live: after completing the NUX, closing and
  relaunching the app landed back on an earlier onboarding screen instead
  of the Dashboard.** Went through three layers before actually resolving,
  in order:
  1. **First real bug, in `EntertainmentConfigSelect`:** `probeState()`'s
     `needsEntertainmentZoneSelect` is purely `hasHue && connectionConfigured
     && !entertainmentConfigurationId`. `EntertainmentConfigSelect.mount()`
     renders no dropdown at all when there's exactly one entertainment
     configuration (the common case), and its dropdown's `onChange` was the
     *only* thing that ever called `POST /api/hue/connection` to persist a
     selection -- so the screen showed "Using: `<name>`" purely for display
     (`getSelected()`'s own fallback to `configs[0]`) while never actually
     persisting it. Worked fine in-session regardless (`HueOutput`'s own
     empty-id fallback picks the only config -- see `output.md`), but
     `entertainmentConfigurationId` stayed `""` forever, re-triggering this
     exact screen on every relaunch. **Fix:** `EntertainmentConfigSelect.load()`
     now silently persists `configs[0].id` right after fetching whenever
     nothing was already selected. This was first marked fixed here
     *before* live verification -- caught by the user, corrected, called
     out as its own process mistake.
  2. **Second real bug, confirmed after retesting:** even with (1) fixed,
     a user with *multiple* entertainment configs who never opens the
     dropdown hits the identical gap a different way --
     `Dropdown._commit()` only fires on an actual click/Enter/Space/Tab
     inside an opened menu, never just from a pre-highlighted default
     sitting there unclicked (confirmed by reading `Dropdown.js` directly).
     Not fixed as a separate patch -- subsumed by fix 3 below, since it
     covers this class of gap generally instead of per-screen.
  3. **Structural fix:** rather than keep patching individual "displayed
     but not persisted" gaps as they're found (zone mapping's own
     `everConfigured` has the exact same shape -- confirmed live, every
     zone stayed `everConfigured: false` forever when defaults were never
     touched, since Zone Mapping's Save button doesn't require or record
     any edit), added a single persisted `Config::nuxCompleted` bool.
     `bootstrap()` checks it first and skips `probeState()`'s whole
     multi-signal derivation once true; `toDashboard()` sets it every time
     it's reached (idempotent). Deliberately not a worry for staleness the
     way a naive "done" flag usually is here, because the Dashboard already
     has a real fix-it path for everything it could paper over (Bridge
     row's "Change bridge", live mode/device controls, zone toggles).
  4. **What actually caused two rounds of "the fix isn't working":**
     `HttpServer` set no `Cache-Control` header at all on any response, so
     a browser could keep executing stale WebUI JS indefinitely after an
     edit, with nothing forcing a re-fetch -- confirmed exactly this
     happened (a hard refresh mid-session visibly advanced past a screen
     that a plain relaunch hadn't). **Fix:** `set_post_routing_handler`
     now adds `Cache-Control: no-store` to every response, static and API
     alike (verified against cpp-httplib's real source that this hook
     covers both). Confirmed live: `nuxCompleted` persisted on the very
     next test, and kept working once the cache was genuinely clear.
- [ ] **Video capture path — colors intermittently wrong for a frame or
  two, no clear trigger.** (→ bd Aurora-vzz) Reported live; user confirmed this predates
  both the `WindowsGrabber` staging-texture fix above and, on further
  recollection, wasn't present before the 2nd-pass work started — so it's
  not explained by anything fixed so far. Deprioritized at the user's
  request; no logging or investigation done yet. Revisit by adding
  temporary per-frame diagnostics to `WindowsGrabber::grabFrameSubsample`
  (e.g. logging when `AcquireNextFrame` returns anything other than a
  fresh real frame) once it's worth the time.

### Polish 2.5 Pass
- [x] Video Mapping auto does screen division assignment. Button gets added to assign auto
- [x] Hue bridge IP address automatically gets found on page start (don't need to wait for user to hit button)
- [x] Maybe integrate hit bridge button to that screen if it works well enough
- [x] Accordian menus need visual distinction
- [x] Zone Mapping general polish
- [x] NUX back and forward logic
- [x] SVG and button polish
- [ ] Revisit double click possiblities (→ bd Aurora-3gy)
- [x] Audio channel bools. Research:
      Here's the finding on item 2: this isn't a WebUI bug at all. ZoneActiveToggleList in the Bridge section has no mode gate of its own — it renders whatever /api/zones returns, unconditionally. The empty list in audio mode traces back to the daemon:

      Pipeline::listZones()/updateZone() in both Aurora-App-Windows/src/main.cpp:290-312 and Aurora-App-Linux/src/main.cpp:379-400** explicitly return nothing / no-op whenever m_isAudioMode` is true:


      Aurora::Runtime::ZoneListResult listZones() const
      {
        if(m_isAudioMode || m_outputPtrs.empty()){
          return {};
        }
        const std::string& name = m_outputPtrs.front()->name();
        return {name, m_orchestrator->zoneMap(name)};   // m_orchestrator is empty in audio mode
      }
      That guard exists because in audio mode m_orchestrator (video) is unset — only m_audioOrchestrator is built — so calling m_orchestrator->zoneMap(...) unconditionally would dereference an empty std::optional. It's a real safety guard, not an arbitrary restriction.

      The good news: AudioOrchestrator (AudioOrchestrator.hpp:54) already maintains its own per-output ZoneMap and exposes a read-only zoneMap(outputName) getter — reconciled/persisted against the same ZoneMapStore the video path uses. So the "active"/"gamma" data genuinely exists and is meaningful in audio mode already; it's just not wired up. What's missing:

      AudioOrchestrator needs a mutator — it currently has no updateZone() at all (only Orchestrator does), so it can't persist a toggle flip yet.
      Pipeline::listZones()/updateZone() in both apps' main.cpp need an audio-mode branch that reads/writes through m_audioOrchestrator instead of bailing to {}/false.
      Once that's done on the backend, no Aurora-WebUI changes are needed — the existing Bridge zone list will just start showing data in audio mode automatically, same as the frontend investigation for item 2 originally assumed.

      Context (2026-09-18 investigation, verified in current code) for whoever implements this:
      - Current guard locations: `Pipeline::listZones()`/`updateZone()` audio bail-outs are at Aurora-App-Linux/src/main.cpp:380-402 and Aurora-App-Windows/src/main.cpp:291-313 (the 290-312/379-400 refs above are stale by a few lines).
      - `AudioOrchestrator` (`Aurora/core/Runtime/...`) holds per-output `ZoneMap`s in `m_zoneMapsByOutput`, reconciled+persisted at `init()` via the shared `ZoneMapStore`, built from the same `m_outputPtrs` the video path uses — so the front output is always present. But `zoneMap()` uses `.at()` (throws `out_of_range` on unknown output) and no mutator exists yet.
      - Toggles take effect live with no extra plumbing: `composeAudioFrame()` already skips `!zone.active` channels and applies per-zone `gamma` (AudioFrameCompositor.cpp). `uvs` is spatially meaningless in audio but persists harmlessly — mirror the full `(uvs, active, gamma)` signature for route compatibility.
      - Frontend/route need no changes: `ZoneActiveToggleList` renders whatever `/api/zones` returns and PUTs `{active}` through `ZonePatchQueue`; `registerZoneRoutes` already threads `active`/`gamma` through. Audio NUX skips Zone Mapping (`probeState` is video-only), so this surfaces on the Dashboard Bridge list only.
      - Locking constraint (from the ZoneMapping-delay investigation): `listZones()`/`updateZone()` run under the `PipelineHost` mutex, held for the whole of every tick including audio ticks — audio branches must take that same lock, and must never trigger a reload (zone PUTs don't today; keep it that way).

      Implemented 2026-09-18: `AudioOrchestrator::updateZone()` added in Aurora core (mirrors `Orchestrator::updateZone` field-for-field); audio branches added to `Pipeline::listZones()`/`updateZone()` in both App-Linux and App-Windows; two new cases in `core/tests/AudioOrchestratorTests.cpp` green with neighboring suites (`AuroraAudioOrchestratorTests` 31 assertions/6 cases, `AuroraOrchestratorTests`, `AuroraRuntimeTests` all passing); confirmed live on Windows (fresh Debug rebuild, Bridge toggles populate in audio mode). No WebUI changes needed, as predicted.