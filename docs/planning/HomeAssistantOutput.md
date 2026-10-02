# Home Assistant output module

Id: home-assistant-output

Status: exploratory (2026-09-30) — research only, nothing built; no bead for
the module itself. Revised 2026-10-01: "Prep work" added (`ha-prep` beads).
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
`/api/hue/discover`, then (Mac only) the menu-bar tip screen, then Output Connect (link button), Entertainment zone
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
  same Team ID or Apple. `Aurora.entitlements` carried
  `disable-library-validation` as a stopgap; it was removed for the 1.0.4
  Developer ID build once the dylibs were bundled and signed with the app
  (`docs/lessons/macos-gui.md`). Third-party plugins loaded at runtime would
  need it back, or signing under the same Team ID. Downloaded plugins also
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

## Prep work

Status: proposed 2026-10-01; all five prep items implemented and verified on
Linux, Windows and Mac (2026-10-01). These items need no new
dependency, work with Hue as the only output, and don't commit to building HA.
Beads carry the details (label `ha-prep`):

- Aurora-pp8: `NSLocalNetworkUsageDescription` in `app/mac/Info.plist.in`
  (already missing for Hue). Done; the built Mac bundle's Info.plist carries
  it and Aurora gets the Local Network prompt. macOS shows its own dialog
  text, not this string (the key is needed for the prompt to fire on recent
  macOS, but is not displayed).
- Aurora-dwo: cpp-httplib version floor (>= 0.46, for `ws::WebSocketClient`).
  Added; Windows and Mac configure and build pass (real ConfigVersion checked
  on Windows).
- Aurora-4y9: per-output `{ probe, stages }` table in `probeState()`/`bootstrap()`.
  Done and checked against the old flow (trace compare + browser, Linux; web/ui
  tests pass on Mac).
- Aurora-a0r: output-neutral zone labels endpoint for Zone Mapping
  (`IOutput::zoneLabels()`, `GET /api/zones/labels`). Done, checked on Linux
  with fake-hue; Windows compiles, passes ctest and serves the endpoint
  under fake-hue; Mac compiles and passes the Hue tests.
- Aurora-d9v: WebSocket client build and connect check on all three platforms.
  Linux, Windows (MSVC) and Mac pass (in-process echo test in
  `AuroraNetworkTests`).

- Aurora-5i3: local API hardening before any HA credential exists. Done;
  rules below, verified on Linux (`AuroraNetworkTests`, Hue
  `[PairingRoutes]`).

Deferred until HA is a go: rate-limited sender, brightness/`rgb_color`
split, Keychain token storage.

### Local API rules

The REST API has no auth and binds `0.0.0.0`. These rules hold for every
route, today's Hue routes and any future HA route:

- **Cross-origin writes are refused.** A non-GET request that carries an
  `Origin` (else `Referer`) naming a different host than its `Host` header
  gets 403 `cross_origin_forbidden` before the handler runs
  (`HttpLibServerImpl.hpp`, `_wrapHandler`). Headerless clients (curl,
  tests) and the same-origin WebUI pass, including the WebUI opened from
  another LAN device. A malformed or `null` Origin fails closed.
- **Residuals of that check.** It compares host only, not port, so a page
  on another port of the same host passes. It is not a DNS-rebinding
  defense. Closing either one needs a Host allowlist (future work).
- **No route returns a stored secret.** `GET /api/hue/connection` reports
  `configured` and the address only; `/api/config` carries no secrets.
  The one exception is `PUT /api/hue/register`. It returns the
  *freshly issued* username/clientkey, never stored ones, and the bridge
  only issues them after the physical link button is pressed.
- **Stored credentials go only to the stored endpoint.** A request that
  names its own bridge address gets no fallback to the stored username
  (`_resolveTarget` in `PairingRoutes.cpp`). Repointing `POST
  /api/hue/connection` at a new address without new creds clears the old
  ones and is refused as `incomplete_connection`.
- **For HA (Aurora-4zr.5):** changing the HA URL clears the stored token,
  for the same reason. Otherwise a LAN client could point Aurora at a fake
  HA and collect the refresh token.
- **`0.0.0.0` stays the default.** The WebUI from a phone or another PC
  needs it, and the Origin-vs-Host check still works across the LAN.
  `boundBackendIP` (`Config.hpp`) narrows it to `127.0.0.1` for anyone who
  wants local-only.

## Findings from HA core source

Read 2026-10-01 from a sparse clone of `home-assistant/core` (`f66cbe4`) in
`../core`. Code reading only; nothing run against a live instance.

- **Login flow works without a token paste (code says yes, untested live).**
  `components/auth/indieauth.py`: if `redirect_uri` has the same scheme and
  host:port as `client_id`, it passes with no fetch. `client_id` may be
  `http://` and a LAN IP is accepted, since the netloc check is lenient:
  `ip_address("192.168.1.5:8080")` fails to parse and is treated as a
  hostname. So `client_id = http://<aurora-host>:<port>/` with a redirect
  back to Aurora is valid.
- **Tokens:** `/auth/token` returns a 30-minute access token plus a refresh
  token. The refresh token expires 90 days after its *last use*
  (`auth/const.py`, `auth_store.py`), so a running Aurora never hits that
  expiry. Store the refresh token (not the access token) in the secret
  store. A long-lived token (`auth/long_lived_access_token`, user-chosen
  lifespan) stays the fallback.
- **`call_service` over WebSocket is blocking:** the result arrives after
  the light's service finishes (`websocket_api/commands.py`,
  `blocking=True`). That reply is the per-light "in flight" signal, so no
  `state_changed` subscription is needed for the rate limiter.
- **Read replies promptly.** HA drops the connection at 4096 queued
  outgoing messages, or after more than 1024 for 10s
  (`websocket_api/const.py`, `http.py`). One result per command means a
  stalled reader thread gets Aurora disconnected.
- **Auth handshake:** HA closes the socket if `auth` isn't sent within 10s.
- **Color:** sending `rgb_color` + `brightness` is right. `light/helper.py`
  converts `rgb_color` to the bulb's mode (rgbw/rgbww/hs/xy). For
  `color_temp`-only lights it picks the nearest white, so Light select
  should still filter to color modes.
- **mDNS:** `_home-assistant._tcp.local.` TXT records carry
  `internal_url`, `external_url`, `base_url`, `uuid`, `version` and
  `location_name` (`components/zeroconf/__init__.py`). Discovery can
  prefill the URL and dedupe by `uuid`.
- **Grouping by integration:** WebSocket `config/entity_registry/list`
  (or `list_for_display`, which skips disabled entities) returns every
  registry entry in one reply (`components/config/entity_registry.py`).
  That each entry carries `platform` (the integration) is from memory:
  `helpers/` isn't in the sparse checkout.
- **Not answered yet:**
  - Recorder exclusion (YAML; docs, not code).
  - All real-light rates.
