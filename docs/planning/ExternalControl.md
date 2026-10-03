# External control: assistants, hubs and Muse driving Aurora

Id: external-control

Status: exploratory (2026-10-02) — research only; nothing built. Beads
filed 2026-10-03 as epic Aurora-5ipy (label `external-control`; phases map
to children `EC 0`-`EC 6c`, Phase 1 is Aurora-3ddb). Agent-proposed except
pause/resume; not committed. Prompted by
evaluating the Muse Gadgets SDK (Meta, Apache-2.0) as an optional
integration.

## Two planes, not one
Status: standing — framing, not a milestone.

- **Data plane:** colors to lights at 10–60 Hz. An `IOutput`
  ([[home-assistant-output]], Hue). Latency-sensitive, LAN-local.
- **Control plane:** start, pause, mode, zone and tuning changes at human
  rate, plus state/health reported back. A REST client, not an `IOutput`.
- They don't compete. The HA output (Aurora → HA over HA's WebSocket API,
  as a client) stays the right shape for the data plane; letting HA *control*
  Aurora is a separate, control-plane adapter. Both may target the same HA
  instance; Aurora-4zr.4 already covers automations fighting the lights.
- Cloud assistants (Muse included) are control plane only. Muse commands
  round-trip through Meta's VM, far too slow for frames; a direct LAN
  ESP32 output would be a DDP/WLED-style `IOutput` with no Muse involved.

## Who would consume it
Status: exploratory.

- **MCP server** — Claude, ChatGPT, Gemini, local LLM clients, HA's MCP
  client. MCP's HTTP transport is POST + SSE, the same shape as below.
- **MQTT with HA discovery** — HA, Node-RED, openHAB. Through HA: Assist,
  Alexa/Google (Nabu Casa), Apple Home (HomeKit Bridge), with no
  per-ecosystem work in Aurora.
- **Muse Gadgets** — a Markdown `gadget-aurora` skill in their repo's
  skills format; the Linux SDK reaches Aurora with `curl` via `system.run`,
  ESP32 boards via the home-network tunnel. Optional: Aurora events posted
  with `musegadget send-user-msg`. Linux-only SDK.
- **Rejected:** Alexa skills, Google cloud-to-cloud, ChatGPT Actions — need
  a public cloud endpoint, contradicting "runs entirely on your machine".
  Matter — heavy SDK, poor device-type fit. HomeKit/HAP directly — covered
  by HA.
- All of these run as **separate helper processes** that call Aurora's
  REST API. None link into Aurora; none run unless a user installs one.
  Licenses on the far side don't matter (Muse SDK is Apache-2.0; a
  Markdown skill is docs).

## Transport
Status: recommendation, not decided.

- **Commands: plain JSON REST** on the existing cpp-httplib server — the
  standing convention ([[http-server-analysis]]).
- **Events: one SSE stream**, `GET /api/events?topics=…`, matching
  "SSE for streaming, REST for everything else"
  ([[implementation-plan-phase-3]]) and the graph preview's SSE + PUT
  ([[node-graph-pipeline]]). One stream with topics, not one endpoint per
  feature: HTTP/1.1 browsers cap ~6 connections per host.
- **No WebSocket server yet.** Commands are low-rate request/response;
  events are one-way. Correction to [[implementation-plan]]'s stretch
  list: cpp-httplib 0.46 already ships `Server::WebSocket`, so the
  deferred WebSocket fork (Aurora-1jb) needs no new dependency when
  bidirectional, high-rate traffic (WebXR pose, live graph editing)
  finally arrives.
- **MQTT stays in the adapter**, not a broker client in the C++ core.
- **UDP/OSC** fits data-rate parameter drivers ([[node-graph-pipeline]]'s
  MIDI/OSC note), not commands or events.
- **SSE constraints:** each open stream holds a cpp-httplib worker, so cap
  subscribers or size the pool (same failure family as Aurora-cgr); the
  tick loop publishes latest values to a slot, never per event under the
  pipeline lock; stream handlers watch a stop flag so `server->stop()`
  doesn't hang; payloads obey "no route returns a stored secret".

## Pause/resume
Status: filed as Aurora-3ddb.

- `/api/stop` quits the process on all three apps, so any controller can
  stop Aurora but never restart it. Biggest single gap.
- Pause = pipeline shutdown with process and server alive; resume =
  reload. `PipelineHost` already tolerates a null pipeline, so no
  `IOutput`/input interface change. Route lives in core
  (`PUT /api/state`), unlike today's per-app `/api/stop`.
- Platform differences are tray menus and resume cost: Wayland re-enters
  the portal (restore tokens should keep it silent), Mac clears the
  screen-recording indicator, Windows is cheap, Hue needs a fresh DTLS
  handshake everywhere (Aurora-vf1.1 measures it).

## Security
Status: recommendation, not decided.

Today every route is on, binds `0.0.0.0`, no auth; only cross-origin
writes are refused ([[home-assistant-output#local-api-rules]],
[[5i3-local-api-hardening]]). Any LAN device can `curl` `/api/stop`.
"Adapters are opt-in" adds nothing while the API itself is open.

- **Layer 1, Host allowlist:** accept only loopback, the machine's LAN
  IPs and hostname. Closes DNS rebinding, which today's Origin check
  doesn't (a rebound domain is same-origin). No UX change.
- **Layer 2, pair LAN devices (decided 2026-10-02: enforced by default,
  no opt-out toggle and no report-only release; breaking current LAN
  users once is acceptable this early):** loopback stays trusted; LAN
  *writes* need a per-device token, approved once from a trusted UI (flow
  under "Prior art"), held as a long-lived revocable cookie. Adapters get
  bearer tokens through the same flow. Phone WebUI keeps working after
  one pairing.
- **Layer 3, LAN reads too:** skip until something sensitive is readable.
  Graph-preview thumbnails would be the first route carrying screen
  pixels; keep that topic localhost-only or off until an editor subscribes.
- Still plain HTTP: a token is visible to a LAN sniffer. Real fix is LAN
  TLS, the same cert-distribution problem as WebXR
  ([[implementation-plan]] Phase 4).
- **Token issuing is not `core/Secrets` work** ([[2dz-secret-store]]).
  Store only token *hashes* (not secrets) beside config; `ISecretStore`
  has no enumerate (needed to list/revoke devices) and may block on unlock
  prompts, which rules it out of a per-request path. It matters only if an
  adapter must keep a credential on the Aurora machine.

## What already helps, what conflicts
Status: snapshot 2026-10-02.

- **Shipped, directly useful:** param schema (Aurora-ta5) as the source
  for generated MCP tool schemas / MQTT entities via `/api/descriptors`;
  `PipelineHost` in core (Aurora-9ig); tuning edits applied live without
  a reload (Aurora-c0g, closed 2026-10-02: hot save ~2 ms and no bridge
  traffic vs ~20 ms structural reload; Linux/Windows and real-hardware
  refreshRate left to CI and Aurora-k0sx); output-neutral zone labels
  (Aurora-a0r); `platform` in `/api/capabilities` (Aurora-8mk.7); local
  API hardening (Aurora-5i3).
- **Open, useful:** Aurora-kea (running-pipeline flags on a minimal
  `GET /api/state` → adapters pick source controls, monitor vs sink, from
  them; the mode list comes from `/api/capabilities` inputs, later the
  Aurora-kep2 effect list); Aurora-lx4.1 / Aurora-x2o
  (always-running process); Aurora-kwn, Aurora-cgr, Aurora-m2c (reliability
  bugs a headless controller hits first); the graph preview's SSE endpoint.
- **Neutral:** HA output (Aurora-4zr.*, Aurora-cyw), Aurora-2dz, Phase 4/5,
  Aurora-h45, WebUI 2.5-pass diffs, Mac build-target beads.
- **No conflict found** in any plan or bead; none mention Muse or external
  control.

## Gaps found while phasing
Status: exploratory — each needs a decision before its phase starts.

- **Pause must live in `PipelineHost::reload`, not the route.**
  `reloadPipelineFromDisk` is shared by settings saves, `/api/reload` and
  Hue pairing; a route-level flag would be silently undone by any of them.
- **A null pipeline blanks the Dashboard.** `listZones()`/`listMonitors()`
  return empty with no pipeline, so Zone Mapping and the monitor picker go
  blank while paused.
- **Write storms.** Several controllers at once each trigger a full
  reload; Aurora-5t2 says concurrent reloads each open a portal dialog.
  External writes need debouncing. Tuning commands no longer need a
  reload (Aurora-c0g shipped), so only structural writes (mode, source,
  output) remain storm-prone.
- **Public vs internal API.** Every route today is WebUI-private and free
  to change. Publish a small set of meaning-level routes (state, mode,
  capabilities, descriptors, events), never the raw `/api/config` blob.
- **Brightness.** "Dim the lights" is the likely first voice command; no
  global brightness control was found. Bead: Aurora-5ipy.7 (EC 5a). A gain
  of 0 yields black, which an HA output treats as off: it must follow the
  same rule as a black scene (Aurora-pngj, [[home-assistant-output]]).
- **Upgrading users.** Enforced pairing 401s a phone that worked
  yesterday; the 401 → "pair this device" path plus a CHANGELOG note
  covers it.
- **Discovery.** Nothing advertises Aurora (`_aurora._tcp`); only HA
  discovery is planned. Deferred: see "Prior art".
- **Adapter home and lifecycle.** In-repo (GPL) or separate repos; who
  starts them (systemd user unit, autostart).
- **Host allowlist details.** `.local` names, IPv6, port in `Host`,
  reverse proxies/custom hostnames (needs an override). Per-OS LAN IP
  enumeration is unnecessary: see "Prior art" (IP literals always pass).
- **HA OAuth callback.** Aurora-4zr.5's redirect back to the local UI must
  pass both the allowlist and pairing.
- **Testing "remote" from loopback.** Route tests run on loopback, which
  is trusted; the middleware needs an injectable is-local predicate.

## Phasing
Status: proposed, not scheduled. Phases 1–3 fix today's app and stand on
their own; 4–5 are the real commitment (breaking LAN users, an API to keep
stable); 6 is cheap once the rest exists. Suggested order: 0, then 1 and 3
in parallel, then 2, 4, 5, 6.

### Phase 0 — decisions
- Settle the open questions below; apply the cross-reference corrections
  to [[implementation-plan]] (WebSocket dependency) and
  [[home-assistant-output]] (Local API rules → this doc).
- Test: `check-links.sh`.

### Phase 1 — pause/resume (Aurora-3ddb)
- Core `PipelineHost` + route (Aurora-3ddb, testable from the CLI with
  `devstack.py up` and curl; no UI needed) unblocks phase 2. Follow-ups,
  split 2026-10-03: Dashboard button (Aurora-5ipy.13), then Mac, Windows
  and Linux tray items (Aurora-5ipy.14-.16; gated by Aurora-nzd, Linux also
  by Aurora-lx4.2). Aurora-vf1.1 sets resume-latency expectations.
- Tests: fake-output unit tests (one `shutdown(false)`; resume rebuilds the
  same config; reload or pairing while paused stays paused); loopback route
  test like the existing reload one; `devstack.py up` + `--fake-hue`
  (viz goes dark, fake bridge sees streaming disabled); manual tray per
  platform, Wayland no-dialog resume, Mac indicator clears.

### Phase 2 — state, then events
- `GET /api/state` first (polling works). Aurora-kea builds its minimal
  form (`paused` + `usesVideoInput`/`usesAudioInput`/`samplesZones`/
  `audioDevicesUrl`, owner-approved 2026-10-03); this phase adds mode,
  source, health and idle/needs-setup. Then `GET /api/events` with
  `state`/`health` topics, explicit pool size, subscriber cap, stop flag.
  The stream's first event is the current `state`, so a client can skip
  the GET and a change between GET and subscribe can't be lost (Hyperion's
  `serverinfo` + `subscribe` returns snapshot and subscription together).
  Coordinate with the graph preview; after or with Aurora-cgr.
- Tests: a new stream's first event equals `GET /api/state`; chunked-stream
  read asserting a pause emits `state`; `stop()`
  returns with a stream open; over-cap stream rejected; high-refresh tick
  with N streams keeps other routes inside a latency budget (doubles as a
  cgr regression).

### Phase 3 — Host allowlist
- Small, independent, fixes today's rebinding gap. Land before
  Aurora-4zr.5 (first HA credential), same logic as Aurora-5i3.
- Tests: forged hostname `Host` → 403; IPv4/IPv6 literals, `localhost`,
  hostname and `.local` pass with and without port; configured extra name
  passes; manual phone check.

### Phase 4 — LAN pairing
- Backend (mint, hash store, middleware, injectable is-local, test-only
  mint path), enforced from the first release with no opt-out (decided
  2026-10-03; if users ask later, an explicit, visible "trust this subnet"
  list, off by default); WebUI pairing screen,
  global 401 handler in `app.js`, device list + revoke. Before phase 6 and
  before graph thumbnails ship; must admit Aurora-4zr.5's callback.
- Tests: middleware unit tests (local passes, remote without/revoked token
  401, valid token passes, Origin check still applies to cookies); jsdom
  pairing screen and 401 routing; manual pair, revoke, and upgrade path.

### Phase 5 — public API contract
- Hand-written OpenAPI for the public subset plus an `apiVersion`
  (generator trade-off under "Prior art").
- Test: walk registered routes, fail when a public route lacks a spec
  entry or the reverse; lint the spec with a standard OpenAPI validator.

### Phase 6 — adapters
- MCP server, then MQTT bridge, then the Muse skill. The MQTT bridge
  re-publishes HA discovery when kea's flags change (mode switch), so the
  monitor/sink entity matches the running pipeline. After Aurora-kea
  (Aurora-c0g is done) and fixes for Aurora-m2c / Aurora-kwn.
- Tests: each against `--fake-hue --fresh` + devstack; MCP via scripted
  client calls asserting `/api/state`; MQTT via Mosquitto + HA in Docker
  (shared with Aurora-4zr.8); Muse manual on a Pi (needs Meta's cloud).

### Interaction with planned work

| Planned item | Effect |
|---|---|
| Aurora-lx4.2, Aurora-x2o (trays) | Phase 1 adds a menu item to each |
| Aurora-vf1.1 (reload timing) | Resume-latency expectation |
| Aurora-cgr (mutex starvation) | Fix before/with phase 2 |
| Graph preview SSE ([[node-graph-pipeline]]) | Shares phase 2's stream |
| Aurora-4zr.5 (HA Connect) | Phase 3 first; 3–4 admit its callback |
| Aurora-d7s (Output section) | Possible home for the device list |
| Aurora-kea | Builds phase 2's minimal `GET /api/state`; prerequisite for phase 6 (Aurora-c0g shipped) |
| Aurora-5t2 (concurrent reload portals) | Write debouncing helps both |
| Aurora-1jb, Aurora-4zr.* data plane, Phases 4/5 | Independent |

## Prior art and what it settles
Status: research 2026-10-02 (web). Proposals, not decisions; each names
what it resolves above.

- **Host allowlist without enumerating interfaces.** Vite and
  webpack-dev-server always admit IP-literal `Host` values: rebinding needs
  the attacker's *hostname* in `Host`, so a bare IP can't be a rebinding
  vector. Rule: allow any IPv4/IPv6 literal, `localhost`/`*.localhost`,
  the machine's hostname and `.local` name, plus a user-set extra list.
  Drops the per-OS LAN IP enumeration gap. Syncthing shows the escape
  hatch a reverse proxy needs (`insecureSkipHostcheck`); allow it only
  with pairing on.
- **Browsers are closing part of the gap, not all of it.** Chrome's Local
  Network Access prompt (Chrome 142, Oct 2025; enterprise opt-out removed
  in Chrome 156, 2026-10-20) asks before a public site reaches a private
  IP, which blunts rebinding in Chrome. Firefox and Safari aren't covered
  by it; keep the Host check. Same-origin WebUI requests aren't affected.
- **One approval flow for phones and adapters.** OctoPrint's Application
  Keys and Hyperion's `requestToken`/`answerRequest` share a shape: the
  new client POSTs a request carrying a short display code, a trusted UI
  shows "Approve <name> (code K7Q2X)?", the client polls (OctoPrint: 202
  pending, 200 + key, 404 denied). Jellyfin Quick Connect is the same
  backend driven from the other side. For Aurora the trusted UI is the
  loopback WebUI or an already-paired device; a tray notification plays
  the role of the Hue Sync Box's physical button on headless boxes. QR is
  optional sugar (URL + code). This replaces "QR-only pairing" in
  Security, layer 2, and covers adapters, which can't scan a QR.
- **A cheap "is auth required?" probe.** OctoPrint probes with a 204
  before starting the flow. Hyperion's HA integration has recurring
  "Failed to determine if authorization is required" reports; a dedicated
  unauthenticated probe avoids that class of bug.
- **Scopes.** Hyperion splits *control* (color, effects, components) from
  *admin* (config, tokens, instances), and admin auth is now always on.
  Aurora equivalent: adapters get a control scope (state, mode,
  brightness, source) by default; config, pairing and output credentials
  are admin, local or explicitly granted.
- **What "pause" means elsewhere.** The Hue Sync Box's `syncActive` off
  drops to passthrough/powersave and resumes the previous mode; config
  stays editable. Hyperion's LED-device toggle disables output and keeps
  the instance. Both treat pause as a *state of a running app*. Settles
  "settings save while paused": save, stay paused, apply on resume. For
  the blank Dashboard: keep the teardown (capture and its OS indicator
  stop) but serve zones from `ZoneMapStore` and monitors from a cached
  last list while paused.
- **A public API template already exists.** The Sync Box's execution
  resource (sync on/off, mode, intensity, brightness 0–200, input,
  entertainment area) maps almost 1:1 onto Aurora's public subset: running,
  mode (video/audio), brightness, source (monitor/sink), output target.
  Version it as a prefix (`/api/v1/`, as the Sync Box does), leaving
  internal WebUI routes unversioned. huesyncbox's HA docs warn intensity
  applies to the *current* mode, so changing both takes two ordered
  calls: make Aurora's write one atomic body instead. Confirms brightness
  as a first-class control.
- **Events on one stream.** Hyperion multiplexes named subscriptions
  (`components-update`, `settings-update`, ...) on one connection: the
  precedent for topics on one `/api/events`, graph preview included.
  cpp-httplib is blocking, thread-per-connection (pool base
  max(8, cores−1), scaling to 4×); its issue #1840 shows dead SSE clients
  holding workers until the pool runs out. Send a heartbeat comment
  (`: ping`) every ~15 s so writes to a dead socket fail and free the
  worker, plus the subscriber cap. Polling stays valid: openHAB's Sync Box
  binding polls every 10 s, so state-before-events holds.
- **Write storms.** Same newest-wins rule as the HA output's sender:
  at most one pending reload, carrying the latest config, coalesced
  behind the one in flight. Also addresses Aurora-5t2's concurrent portal
  dialogs. (Reasoned, not sourced.)
- **Brightness: a global gain stage.** The Sync Box (brightness 0–200
  over the sync), Hyperion (`adjustment` brightness per instance) and
  WLED (`bri`, a master over every effect) all put the master dimmer
  after color computation and before any output. Aurora equivalent: one
  multiplier on `Frame` colors in the pipeline, output-neutral, a public
  control. Today's brightness-ish knobs are tuning, not a dimmer:
  `zones.gamma` (both modes; Hue applies `rgb^(2^(-2·gamma))` per
  channel, so gamma > 0 already lifts dark tones) and the audio-only
  floor, vibrancy and reference RMS. Video has no floor. Scales differ by
  API and don't conflict: Hue's CLIP v2 `dimming.brightness` is 0–100 %,
  the entertainment stream Aurora uses is 16-bit RGB per channel, and the
  Sync Box's 0–200 is a *relative* modifier (100 = unchanged). Range:
  0–100 % first; widening to a boost later is backwards compatible, and
  gamma may already cover dark content. Hyperion also puts the dimmer
  upstream of its devices and applies a minimum-brightness floor
  (`backlightThreshold`) in the same color stage, so zero never reaches its
  HA output; the zero-brightness rule for Aurora is Aurora-pngj.
- **Discovery (deferred).** Hyperion advertises `_hyperiond-json._tcp`,
  WLED `_wled._tcp`. A `_aurora._tcp` record would let software find
  Aurora's address, port and (in TXT) version, API base and
  auth-required without the user typing anything. It does not help the
  phone WebUI: browsers can't browse mDNS services, only resolve
  `hostname.local`, which the OS already publishes on Mac and Ubuntu.
  HA zeroconf discovery needs an HA integration, not the MQTT path; MCP
  clients take a configured URL. No consumer needs it yet. Cheap win
  meanwhile: print `http://<hostname>.local:<port>` and the LAN IP
  (the Aurora-2qj gap). Cost when wanted: Bonjour on Mac, Avahi on Linux
  (new dependency) or header-only `mdns.h`, the Windows DNS-SD API
  (unverified here).
- **OpenAPI: spec-first generation exists, route-first doesn't.**
  openapi-generator has had a `cpp-httplib-server` generator since 7.15.0
  (spec → handler stubs and models on `httplib::Server`). Aurora's routes
  sit behind its own `Aurora::Network::Http` façade, which keeps cpp-httplib
  out of every handler ([[http-server-analysis]]); generated code would
  bypass that boundary. No tool turned up that writes a spec *from*
  existing cpp-httplib routes. So: hand-write the spec for the small
  public subset, enforce it with the route-walk test, and reuse the same
  spec to generate adapter clients (Python/TypeScript generators), which
  is where generation pays off.
- **MCP adapter.** The spec says servers MUST validate `Origin` and
  SHOULD bind localhost; stdio transport avoids an HTTP listener entirely.
  Start with stdio.
- **MQTT adapter.** Device-based discovery; publish discovery retained
  *and* re-publish on HA's `homeassistant/status` birth message; an LWT
  availability topic that also goes offline when Aurora is unreachable.

Sources: [Vite server options](https://vite.dev/config/server-options),
[webpack-dev-server IP-host commit](https://github.com/webpack/webpack-dev-server/commit/72efaab83381a0e1c4914adf401cbd210b7de7eb),
[Syncthing FAQ](https://docs.syncthing.net/users/faq.html),
[Chrome LNA](https://developer.chrome.com/blog/local-network-access),
[OctoPrint Application Keys](https://docs.octoprint.org/en/main/bundledplugins/appkeys.html),
[Hyperion JSON-API commands](https://github.com/hyperion-project/hyperion.ng/blob/master/doc/development/JSON-API%20_Commands_Overview.md),
[Jellyfin Quick Connect](https://jellyfin.org/docs/general/server/quick-connect/),
[openHAB hueSync binding](https://www.openhab.org/addons/bindings/huesync/),
[huesyncbox for HA](https://github.com/mvdwetering/huesyncbox),
[cpp-httplib #1840](https://github.com/yhirose/cpp-httplib/issues/1840),
[MCP transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports),
[HA MQTT](https://www.home-assistant.io/integrations/mqtt/),
[WLED security](https://github.com/wled/WLED/wiki/Security),
[mdns_cpp](https://github.com/gocarlos/mdns_cpp),
[openapi-generator cpp-httplib-server](https://openapi-generator.tech/docs/generators/cpp-httplib-server/),
[HACS integration layout](https://www.hacs.xyz/docs/publish/integration/).

## Where adapters live
Status: recommendation, not decided.

History: plugins went to separate repos on 2026-09-13 (independent
dependencies, one repo per user-facing choice) and came back into this
repo on 2026-09-21 ([[monorepo-reorg]]): cross-cutting changes needed to
land atomically, path-filtered CI already gave independent builds, and
sibling repos' outward references rotted with no checker covering them.
The rule that survived: repo boundaries follow *independent user-facing
choices*, and anything coupled to a shared contract moves with it.

- **In-repo `adapters/<name>/`** (MCP, MQTT): each is coupled to the
  public API the way the plugins were coupled to `core/`. An API change
  and its adapter fixes land in one commit; the phase 5 contract test and
  each adapter's tests run in the same CI, path-filtered like `web.yml`.
  Different language (Python/TypeScript) doesn't matter: `web/` is
  already JS. GPL is fine for both. Publish to PyPI/npm from the
  subdirectory if wanted.
- **Muse skill in-repo, mirrored upstream.** It's documentation of
  Aurora's API, so it must change with it. Muse reads skills by link or
  paste, so it works from this repo; a copy can be PR'd to the Muse repo's
  `skills/` (Apache-2.0, their contribution terms) for discoverability.
- **The one forced exception: an HA custom integration** (only if the
  MQTT path proves insufficient). HACS requires one integration per repo
  under a root `custom_components/`, which this repo can't satisfy. That's
  the distribution channel drawing the boundary, not a design choice.
- **Separate repos per adapter: rejected** for the reasons the monorepo
  reorg recorded.
- **Lifecycle (decided 2026-10-02: Aurora supervises).** MCP clients
  spawn stdio servers themselves, so MCP needs no service. The MQTT
  bridge is long-running: Aurora starts enabled adapters as child
  processes (WebUI toggle), restarts them with backoff, stops them on
  exit (Windows: a job object so children die with Aurora), and issues
  their token itself, skipping pairing.
- **Consequence: adapters Aurora supervises can't be Python or Node.**
  Neither OS ships a usable interpreter: macOS's `/usr/bin/python3` is a
  stub that prompts to install the Xcode Command Line Tools; Windows'
  `python3` is an App Installer alias that opens the Microsoft Store.
  (Linux distros do ship python3.) Bundling a runtime or a PyInstaller
  build means signing and notarizing it inside `Aurora.app`. Instead,
  build the MQTT bridge as a **C++ helper executable** in the same CMake
  superbuild: reuses cpp-httplib, nlohmann and the existing signing path.
  MQTT client: Eclipse Paho C, dual EPL-2.0 / EDL-1.0; take it under
  EDL-1.0 (BSD-style), which is GPL-compatible. Still a separate process,
  so "no MQTT in core" and crash isolation both hold. MCP (client-spawned)
  and the Muse skill (Markdown) are unaffected.

## Non-goals
Status: decided 2026-10-03.

- **No color or effect injection.** Aurora's lights react to inputs
  (screen, audio) dynamically; they are not a "set the lights to red"
  device. Hyperion's priority mux (API color, effects and grabber
  arbitrated by priority and timeout) is deliberately not copied. The
  control plane chooses *which* input drives the lights, the mode, the
  zones, tuning and brightness, and pauses or resumes, never what color
  they show. A voice "make it red" is declined, not routed to a
  `/api/color` route.
- **Revisit** only if the node graph ([[node-graph-pipeline]]) grows
  external-value source nodes (MIDI/OSC-style parameter drivers). Those
  would feed a graph input that still reacts, not bypass it.

## Still open
Status: owner decisions.

- **Brightness boost above 100%:** only if real content proves too dim
  and gamma doesn't fix it.
- **Video brightness floor:** audio mode keeps lights from going fully
  dark on quiet passages; video has nothing equivalent for black frames.
  Whether to add one is a tuning question, separate from the dimmer.
