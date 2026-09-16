# WebUI manual tweaks

Follow-up to `WebUIAnalysis.md`. That doc's 19-step build order is done and
each screen passed its own jsdom/live verification, but "verified" isn't
the same as "actually usable" — this doc tracks the gap between the AI-built
first pass and a human sitting down and using it, found by hands-on use
after the build order closed out.

Keep entries short: what's wrong, why it matters, a proposed fix if one's
obvious. Full investigation/fix details belong in the commit or PR that
closes the task, not here — see `Analysis/lessons/engineering-hygiene.md`'s
entry on build-log doc density for why.

## Open tasks

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
- [ ] **No way to discover the WebUI's URL.** Root cause found: the printed
  line was `config.boundBackendIP()` verbatim, which defaults to `"0.0.0.0"`
  — a bind-all address, not something a browser can reliably navigate to
  (behavior varies by browser/OS, matching the flaky "0.0.0.0 worked/didn't
  work" reports). Fix in progress: `browsableAddress()` substitutes
  `127.0.0.1` for that case; auto-launch the browser on first setup only,
  print a clickable link (not auto-launch) otherwise. Same bug existed
  identically in both `Aurora-App-Windows` and `Aurora-App-Linux`.
- [ ] **Back navigates to the previous onboarding *step*, not "undo this
  screen's own choice" — surprising, not necessarily wrong.** Hit while on
  Tuning (audio mode, mistaken for the Dashboard) wanting to switch back to
  video; Back instead returned to Output Connect (the actual previous
  chain step), several steps earlier than expected. The toggle to actually
  do what was wanted (Mode+Device Select's or the Dashboard's own
  Video/Audio segment) was reachable without Back at all. Worth deciding
  whether Back's semantics need to change or this is just discoverability.
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
  headless.** `httpServer.bind()` failing (port in use) just logs to
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

## Zone Mapping: channel selection & identification

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
