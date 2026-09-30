# Home Assistant output module

Id: home-assistant-output

Status: exploratory (2026-09-30) — research only, nothing built, no bead yet.
Findings came from reading `core/Output`, `output/hue`, `app/mac` and HA's
public docs; per-vendor rate figures are from memory of vendor guidance, not
re-measured — treat them as order-of-magnitude until tested on real lights.

## Decision sought

Whether to add `output/homeassistant/` as a second `IOutput` so Aurora can
drive any color light HA exposes, and how it ships. Related: how extensible
the output set should be after that ([[implementation-plan]] defers a
runtime-loaded plugin system).

## Shape of the module

- `HomeAssistantOutput : Output::IOutput`, same `Contracts::Frame` input as
  Hue; processing is untouched.
- Transport: HA WebSocket API (`auth` with a long-lived token, then
  `call_service` `light.turn_on`, each with an id so commands can be sent
  without waiting on replies). REST `POST /api/services/light/turn_on` is a
  slower fallback.
- Zones: each selected `light.*` entity gets a `uint8_t` zone id through the
  existing `ZoneMap`/reconciler. Setup lists `GET /api/states`, keeping
  entities whose `supported_color_modes` include hs/xy/rgb/rgbw/rgbww.
- Color: HA separates color from brightness. Split `Zone.color` into
  `brightness` (largest channel, gamma applied) and `rgb_color` (scaled so
  that channel is 255); HA maps that to the bulb's native mode. Same
  principle as the Hue XYB lesson in `docs/lessons/output.md`: let the
  device side do gamut mapping.
- Rate limiting is the real design work. `send()` only stores the latest
  color per light; a sender thread drains them. Newest-wins (never queue),
  per-light max rate, at most one command in flight per light, skip
  sub-perceptible changes, `transition` ≈ send interval. Knobs exposed as
  control descriptors like `hueControlDescriptors()`.
- Users should exclude the synced entities from HA's recorder (every
  `turn_on` is a state write).

## Is HA fast enough

HA itself adds roughly single- to double-digit ms. The bulb's protocol is the
limit: ESPHome, WLED (JSON API), LIFX ~10-30 Hz per light: fine for
ambient/screen sync. Zigbee/Matter-Thread share ~10-20 msgs/s across the
mesh: marginal beyond a few lights, late for beat-reactive audio. Hue via HA
is worse than the native Hue module. Yeelight (without music mode) and cloud
integrations are unusable. No real-time light-streaming API exists in HA as
of 2026.9; a direct WLED/DDP output would be the fast Wi-Fi path.

## CMake and Mac app impact

- Mirrors Hue: root `AURORA_ENABLE_OUTPUT_HOMEASSISTANT`, per-app
  `AURORA_APP_ENABLE_HA_OUTPUT` + guarded FetchContent + conditional link,
  plugin-level `..._IO_AVAILABLE` define, `registerOutput` behind `#ifdef`.
- No new dependency: cpp-httplib 0.46.0 (already fetched by core) has
  `httplib::ws::WebSocketClient`. Core's `find_package(httplib QUIET)` can
  pick an older system copy, so add a version floor.
- Don't use libcurl for the socket: the Mac build links Apple's system
  libcurl 8.7.1, which lacks `ws`/`wss`. Homebrew curl has it but would add a
  bundled dylib to `tools/mac/bundle-dylibs.sh`, licenses and notarization.
- `wss://` needs httplib TLS (OpenSSL or Mbed TLS); ship `ws://` first.
- No entitlement changes. Add `NSLocalNetworkUsageDescription` to
  `app/mac/Info.plist.in` (missing today, affects Hue too), and
  `NSBonjourServices` if mDNS discovery is added.
- Store the HA token in the Keychain, not a JSON file: it grants control of
  the whole home.
- Licensing: HA Core is Apache-2.0; Aurora is GPL-3.0-or-later; only a
  network protocol is shared, so no conflict.

## NUX changes

Today's flow (`web/ui/app.js`) is Hue-only end to end: Welcome starts
`/api/hue/discover`, then Output Connect (link button), Entertainment zone
select, Mode+Device, Zone Mapping, Dashboard. `probeState()` derives each
`needs*` flag from `/api/hue/connection`, and Dashboard's Bridge section and
Zone Mapping's labels (`/api/hue/channels`) are Hue-specific too.

Proposed:

- **Output choice right after Welcome.** Welcome starts Hue discovery and HA
  mDNS discovery (`_home-assistant._tcp`) in parallel, so the picker can say
  "Hue bridge found at X / Home Assistant found at Y". Skipped when the build
  has one output.
- **Per-output sub-flow, then the shared tail.** Hue: Connect, then
  Entertainment select (unchanged). HA: Connect (URL + auth), then Light
  select. Both rejoin at Mode+Device, then Zone Mapping. In code, a per-output
  table `{ probe, stages }` replaces the hardcoded Hue branches in
  `probeState()`/`bootstrap()`. The selected output persists in
  `Config::activeOutputNames`.
- **HA Connect.** Prefer HA's OAuth-style login flow (redirect back to
  Aurora's local UI) over pasting a long-lived token. Whether HA accepts a
  localhost `client_id`/`redirect_uri` needs a prototype; the token paste is
  the fallback. Reject or explain `https://` URLs while v1 is ws-only. On Mac,
  warn before the first LAN connection triggers the Local Network prompt
  (same pattern as `MacPermissionRecovery.js`).
- **HA Light select** replaces Entertainment select: color-capable entities
  only, grouped by integration via the entity registry. Warn on slow paths
  ("Zigbee: may lag with many lights"), steer HA-exposed Hue lights to the
  Hue output, and suggest a light cap. An optional test pulse can measure
  round trip (`call_service` until its `state_changed`) and seed the
  per-light rate limit.
- **Zone Mapping** needs generic zone labels (an output-neutral endpoint
  returning channel names for Hue or `friendly_name` for HA). The canvas is
  unchanged; zones already default to full-frame, not Hue positions.
- **Dashboard.** "Bridge" becomes "Output", with per-output content and a
  "Change output" action.

Changing output later should **not** reset NUX (`nuxCompleted` stays true).
"Change output" re-enters only the chosen output's sub-flow, then runs the
existing probe chain. That chain already skips steps that are still valid, so
Mode+Device is skipped and Zone Mapping appears only if the new output's zones
were never configured. Keep the old output running and its credentials saved
until the new sub-flow completes, so abandoning halfway strands nothing and
switching back needs no re-pairing. The Hue-to-HA switch must still send Hue's
authoritative stop (a different target, so `isReplacement` should be false;
see the shared-bridge-state lesson in `docs/lessons/output.md`).

Open: running Hue and HA at once. The Orchestrator supports several outputs,
but `/api/zones` returns one `outputName` and Zone Mapping edits one output.
NUX should pick one; "add another output" is later Dashboard work.

## Release packaging and extensibility

Recommendation: **one release build with every first-party output compiled
in**; the existing Registry/`Config::activeOutputNames` chooses at runtime
(the "two-level plugin selection" already in `app/*/CMakeLists.txt`). The
per-output CMake options stay for slim/dev/CI builds, not as separate
downloads. Switching the active output live already works (`PipelineHost`
reload, `registerOutput` re-registration from the WebUI).

User-extensible loading (`dlopen`/`LoadLibrary`) is a different, larger
decision. Costs:

- `IOutput` is a C++ virtual interface carrying `std::string`/`std::vector`
  (`Frame`), so ABI is tied to compiler and stdlib. A real plugin ABI needs a
  new versioned C interface (function table + plain structs).
- macOS: hardened runtime library validation only loads dylibs signed by the
  same Team ID or Apple. `Aurora.entitlements` carries
  `disable-library-validation` as a stopgap that Aurora-qy5.6 intends to
  remove; third-party plugins would make it permanent. Downloaded plugins also
  get quarantined, and ad-hoc/unsigned ones are refused on Apple silicon.
- Each plugin's own dependencies (Hue: Mbed TLS, libcurl) must be bundled or
  vendored per plugin, and code loaded into Aurora's process must be
  GPL-compatible.
- No safe unload, and a plugin crash takes down the whole app.

Cheaper alternative if extension is the real goal: one generic built-in
"external output" that streams frames over a documented local socket/WebSocket
to a separate helper process. No ABI, no signing constraints, crash-isolated,
any license or language for the plugin author. (`tools/light-viz-relay` is
already a step in this direction.)

Suggested order: HA as a compiled-in first-party output; revisit the external
output protocol only if third parties ask for it; dlopen last, if ever.
