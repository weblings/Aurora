# API v1 spec review: fields, scopes, public and internal split

Id: api-v1-review

Status: reviewed and owner-approved 2026-10-23 (Aurora-5ipy.20, closed).
Agent-proposed, researched, then accepted as revised in the "Confidence"
section. The ordered work lives in [[api-v1-plan]]. Snapshot of the
routes at `1b4d7b8`.

Input: [[external-control#phase-5-public-api-contract]] and the lesson
"Don't freeze mode: video|audio into a public API" in
`docs/lessons/architecture-process.md`. The question asked of every public
field: does it still mean something when an effect uses both inputs, or
neither?

## Recommendations
Status: researched 2026-10-23 (web, sources at the end). Proposals for the
owner, not decisions.

The rule underneath all of them comes from Google's AIP-180: within one
major version, an old client must keep working against a newer server.
So adding a field, route or enum value later is free, and removing or
renaming one is not. When in doubt, leave a field out of v1.

1. **Thin layer, not aliases, for `state`, `effects`, `capabilities`,
   `version`.** One `PublicApiRoutes.cpp` with v1 handlers that call the
   same `PipelineHost` and `ConfigStore` functions and build their own
   JSON. That is the facade pattern from strangler-fig migrations: the
   public shape is translated at one boundary, so internal routes stay
   free to change. **Graph routes** (drafts, validate, preview, test,
   apply, nodes, presets) register under both prefixes from the same
   handler. Their shapes were built for agents in Sequences C and D, and
   the shared error helper (item 6) removes the only difference.
2. **`PATCH /api/v1/state`, merge-patch semantics, all or nothing.**
   - AIP-134 calls for PATCH on partial updates and discourages PUT for
     them, since adding a field to a PUT body later is a breaking change.
     RFC 7396 (JSON Merge Patch) is the standard body shape: absent means
     unchanged. WLED's `POST /json/state` and the Hue Sync Box's
     `PUT /api/v1/execution` both take partial bodies for the same
     reason. Aurora's `PUT /api/config` already behaves as PATCH.
   - Writable: `running`, `effect` (the requested id, with
     `activeEffect` output-only, see "Confidence"), `brightness` (0 to
     100 percent). Any other field,
     unknown or read-only, gets 400 `read_only_field` or `unknown_field`.
     The server is strict on input, and clients are tolerant on output.
     `null` is rejected, since no writable field can be null.
   - Validate every field before writing any, then one
     `ConfigStore::update` and one coalesced reload. An effect change
     while paused is saved and applied on resume, as settings saves
     already are.
   - Answer 200 with the full new state, as WLED returns state after a
     write. This follows Kubernetes' spec and status split: `effect` and
     `brightness` written are desired state, and `effect` read back with
     `requestedEffect` is observed state. Aurora already has that split. A
     reload that fails after the save goes into `errors` (source
     `reload`), as it does today, instead of a one-off `reloadError` key.
   - Keep `PUT /api/effects` internal and leave it out of v1. One write
     route per field avoids two ways to do the same thing.
3. **Add a `Control` scope: Read < Draft < Control < Apply < Admin.**
   (Revised 2026-10-23: first proposed below Draft. Draft never touches
   the lights, since drafts only reach them through Apply, so a scope that
   pauses and dims must sit above it. Otherwise every draft-only agent
   could change the lights.)
   Scope-design guidance warns against both one coarse admin scope and
   one scope per route, and recommends bundles per kind of client. Aurora
   has two kinds of clients that differ:
   - Controllers (HA via MQTT, Muse, a voice assistant) pause, dim and
     switch between saved effects.
   - Agents author and apply new graphs.

   Switching between saved effects is less powerful than applying a new
   graph, so a voice assistant should not need Apply. `PATCH state` needs
   Control. A Control token can also write drafts, which is harmless
   because drafts are capped and never reach the lights. GitLab's work on
   fine-grained tokens found resource-by-action matrices confuse users, so
   a five-step ladder ordered by power over the lights is the simpler
   choice. Scopes are stored by name
   (`scopeFromName`), so a new tier does not invalidate existing tokens.
   Check the comparison in `AccessGuard::decide` still orders correctly.
   If a fifth scope is too much for the pairing UI, the fallback is
   `PATCH state` at Apply.
4. **Deleting a saved effect needs Admin, and stays out of v1.** Guidance
   keeps destructive actions behind a separate, rarely granted
   permission. Deleting is the only public-looking write that loses user
   work. Fix the `/api/effects` prefix rule now, independent of v1, with
   an Admin rule on `DELETE /api/effects/` (the longest matching prefix
   wins).
5. **Leave `usesVideoInput` and `usesAudioInput` out of v1. Always fill
   `graphInputs`.** Under AIP-180 a field can be added in 1.x but not
   removed, and these two will change meaning once they follow the graph.
   Kubernetes Gateway API keeps fields that may still change in a
   separate experimental channel for the same reason. Built-ins get
   `graphInputs` too (`builtin.video` is `{video: true, audio: false}`),
   so clients have one rule and no fallback to the flags.
6. **RFC 9457 problem details for every error, with legacy keys kept on
   internal routes.**
   - v1 errors: `application/problem+json` with `type`, `title`,
     `status`, `detail`, plus extension members `code` (Aurora's existing
     snake_case codes) and `errors` (validation issues). RFC 9457
     replaces RFC 7807, allows extension members, and is what Spring and
     Swagger tooling read.
   - **Keep `succeeded` and `error` in v1 too** (revised 2026-10-23:
     first proposed dropping `succeeded` in v1). Dropping it contradicts
     recommendation 1, because aliased graph routes would answer with
     `succeeded` under `/api/v1` and without it nowhere. One helper with
     identical bodies on both prefixes beats a cleaner v1 that needs a
     second dialect in every handler. The cost is one redundant field,
     which the status code and body always agree on.
   - So the helper emits problem details plus `succeeded: false` and
     `error: <code>` everywhere. The WebUI reads `succeeded` in 26 places
     and `.error` in 62, so `web/ui` and the demo shim need no change.
   - Unknown `/api/...` paths today fall through to the WebUI's HTML
     `404.html` (the embedded-files catch-all). Add a JSON 404 for
     `/api/` so a client probing `/api/v2` gets problem details.
   - `type` stays `about:blank`. Use URNs if a code later needs
     machine-readable documentation.
7. **Ship titles and descriptions (Aurora-mfud) before the freeze.**
   Adding them later is backwards compatible, so this is about day one,
   not compatibility. The MQTT bridge's HA entity options and the MCP
   effect list both show names to users, and presets already have
   `title` and `description`, so effects should match. For the graph
   document, follow Home Assistant's config entries: a major `version`
   (today `1`) for breaking changes plus a `minorVersion` for additive
   ones. Readers accept any minor version of their major. `title` and
   `description` are minor version 1.

## Confidence
Status: self-review 2026-10-23, second research pass done. Each item
says where it landed. Sources at the end.

### Settled by the second pass
- **`effect` naming: flat fields, `effect` is the intent.** AIP-128
  (declarative-friendly resources) keeps intent and observed state in one
  resource: intent fields are writable, observed fields are output-only.
  AWS IoT device shadows split `desired` and `reported` into separate
  objects, but that suits a device that is offline for hours. Aurora
  applies a change in about 20 ms, so a nested split would only make
  every voice adapter write `{desired: {...}}`. v1 shape:
  - `effect` (writable): the id asked for. Reads back as written, so
    merge-patch semantics hold.
  - `activeEffect` (output-only): what runs. Differs when the asked-for
    effect fell back, and the reason is in `errors` (source `reload`).
  - No `reconciling` flag. AIP-128 asks for one only when changes take
    more than a few seconds.
  - Same split later for anything else that can fall back.

  This reverses the internal names (`effect` is observed there), so the
  spec and the adapter docs must say it once, plainly.
- **Brightness: 0 to 100 percent, a number (decimals allowed).** Google
  Home's Brightness trait is 0 to 100 percent, Alexa's utterances are
  percentages, HA's `light.turn_on` takes `brightness_pct` 0 to 100, and
  Hue CLIP v2's `dimming.brightness` is 0 to 100 with decimals. HA's
  stored attribute is 0 to 255 and Matter's level is 0 to 254. Those are
  8-bit protocol scales, and the MQTT bridge converts (HA's MQTT light
  takes a `brightness_scale` option, unverified here). Decimals keep the
  internal float's resolution.
- **`PATCH state` during a test: the newest write wins, no 409.**
  `LightTest::_expireLocked` already ends a test with `pipeline_gone`,
  without a revert, whenever the build epoch moves, so an effect switch
  or a pause already beats a running test. Keep that. A 409 would let an
  agent's test block a person saying "switch to audio". Two changes:
  - End reason `superseded` instead of `pipeline_gone` when a state
    write caused it, so the agent can tell its user.
  - B4 tests that a brightness change during a test does not end it.
    Brightness is applied live, and whether it moves the epoch is
    unverified.
- **Release split: matches this repo's precedent.** v1.1.2 (pairing,
  brightness) and v1.1.3 (the MCP server) shipped features in patch
  releases, and v1.1.3's notes call the API "not public yet". SemVer
  only binds once a public API is declared, so declaring it is the point
  where a minor bump belongs: 1.2.0. App version and `apiVersion` move
  separately from then on, as Docker's engine and API versions do.
- **Strict unknown-field rejection: keep.** Stripe rejects unknown
  parameters ("Received unknown parameter"). `kubectl` sends Strict.
  Kubernetes made it opt-in only to protect clients that already existed.
- **Linter: not Spectral. Use `openapi-spec-validator`, add vacuum
  only if style rules are wanted.** 2026 reports: Spectral went 14
  months between releases, issue triage fell to about 10 closed so far
  this year, a July issue about compromised dependencies was reportedly
  unanswered, and a fork alleges install-time telemetry was added.
  Several of these claims come from a fork with its own interest and
  were not checked against the repo, but a supply-chain question in a CI
  tool is reason enough. `openapi-spec-validator` (Python, validates
  3.0, 3.1 and 3.2, has a pre-commit hook) fits Aurora-pa6c's pre-commit
  setup. It would also be the repo's first pip dependency, which is an
  open decision (see "Still open"). vacuum (Go, MIT, released July 2026,
  runs Spectral rulesets) is the style linter if one is wanted later.
- **Firefox's SSE default: moot.** Sending `retry:` overrides every
  browser's default, so the unconfirmed Firefox value does not matter.
- **Monitor drift on Windows: confirmed by others.** Chromium's source
  notes `szDevice` can change and be reassigned between physical
  monitors when displays are added or removed. An OBS forum report shows
  Windows renumbering two TVs after a power cycle. Chromium keys on the
  `DISPLAYCONFIG` target id (stable across configuration changes, not
  restarts). libdisplaydevice hashes the instance id plus the EDID for an
  id that survives restarts. Mac: Apple says a `CGDirectDisplayID`
  usually holds until restart, and the label adds " (Primary)". The
  mechanism is solid. Aurora's own drift is still not reproduced, so A8
  starts with a repro.
- **Response shapes are checked in Catch2, not a Python script**
  (revised 2026-10-23). The route-walk test checks that routes and spec
  entries match, not that response bodies match the spec's schemas, and
  contract-testing practice is to check wire responses against the
  contract. The checks go in the existing `core/tests` route tests, which
  already call routes over loopback and run in CI on all three platforms.
  A devstack script would need a running app and would not run in CI. The
  test reads `openapi.yaml` and checks each v1 response with a small
  in-house checker for the schema keywords the spec uses (`type`,
  `required`, `properties`, `enum`, `additionalProperties`). The spec is
  hand-written, so it can stay inside that subset. That keeps zero new
  dependencies, as the repo's Python (standard library only, no
  `requirements.txt`, no `pip install` in CI) and JS (plain `node`
  tests) tooling already does. One internal snapshot struct with two
  serializers also keeps the v1 and internal state builders aligned.

### Still open
- **Spec-file linting: decided 2026-10-23, use the real validator.**
  `openapi-spec-validator`, pinned, in CI and pre-commit. It is the repo's
  first pip dependency, kept to a `requirements.txt` beside the spec so
  it stays scoped to that job. Standard-library Python cannot fully
  validate OpenAPI, and the Catch2 checks only cover the parts they
  exercise.
- **Source selection: promised in v1.1.3's changelog, now possible in
  v1.0** (revised 2026-10-23). Its notes list "pause, brightness,
  source" as MCP control tools to come. Stable monitor keys moved to
  1.1.4 (A8), so source selection can join v1.0 (B8) if A8 lands and is
  verified on all three platforms by the time `PATCH state` is done.
  Otherwise it ships in v1.1 (C1 in [[api-v1-plan]]), and the 1.2.0
  notes say so. The freeze
  does not wait on it.
- **Pairing statuses** stay a deliberate deviation: RFC 8628's codes,
  REST statuses (202, 403, 410, 429) instead of its 400.

### Revised after the first check
- Control scope order (recommendation 3): now above Draft.
- `succeeded` in v1 (recommendation 6): kept, so aliasing works.
- Stream cap: 4 only up to 9 hardware threads.
- WebUI `.error` count: 62, not 64 (the first count included
  `console.error`).
- Unknown `/api` paths return HTML today: JSON 404 added to A5.

### High confidence
- Additive-only within a major (AIP-180), PATCH for partial updates,
  RFC 9457 for errors, leaving unstable fields and monitors out of v1,
  Admin for delete, snapshot-first events with no replay, unversioned
  version probe, contract harness before routes.

## Smaller items
Status: researched 2026-10-23 (web plus code). Proposals.

### Pairing routes in the spec
Today: `POST /api/pairing/request {name, scope}` answers 202
`{pollKey, code}`. `GET /api/pairing/request/:pollKey` answers 202
pending, 200 approved with `token`, or 404 `unknown`. A request lives
300 s (`kRequestLifetimeSeconds`). Denied, expired and never-existed all
read as 404.

The flow is the shape of the OAuth device authorization grant (RFC 8628),
which is the standard for devices that pair from somewhere else: request,
show a code, poll, get a token. Its polling contract is what generated
clients and libraries already know.

- **In the spec, with `security: []` on exactly these two operations.**
  An empty security array is how OpenAPI marks a route public. Scanners
  flag it, because one stray empty array leaves a route open, so the
  route-walk test asserts no other operation has it.
- **Return `interval` and `expiresIn` from the request** (RFC 8628's
  `interval` and `expires_in`, here 2 s and 300 s). Clients stop guessing
  the poll rate and the lifetime.
- **Tell the poller why it stopped.** Keep a short tombstone per poll
  key, so the poll answers `access_denied` (403) or `expired_token` (410)
  instead of 404 for both. Take RFC 8628's codes, not its status codes:
  its token endpoint answers 400 for pending, denied and expired alike,
  because that is OAuth's error convention. Aurora's poll already answers
  202 for pending, and the WebUI and MCP adapter depend on it, so keep
  REST statuses and use the RFC's vocabulary in `error` (`authorization_pending`,
  `access_denied`, `expired_token`, `slow_down`). RFC 8628 separates
  denied and expired for this reason: a denied adapter should tell its user, and an expired
  one should start over. The MCP adapter's pairing loop
  (`adapters/mcp/src/Pair.cpp`) prints "denied or expired" today because
  it cannot tell.
- **Polling too fast:** 429 with `Retry-After`, the HTTP form of RFC 8628's
  `slow_down`. Cheap, and it caps a misbehaving adapter.
- **`GET /api/pairing/status`** (the "must I pair?" probe) goes in too.
  It is unauthenticated and an adapter's first call.

### Monitors
Today's `name` is not stable on any platform, which matters more than the
index `id`:

| Platform | `name` today | Changes when |
|---|---|---|
| Mac | `Display <CGDirectDisplayID>` plus ` (Primary)` | Primary display changes. The id itself can change across restarts |
| Windows | DXGI `DeviceName` (`\\.\DISPLAY1`) | Displays are reordered or replugged |
| Linux X11 | RandR output name (`DP-1`) | MST hubs (`DP-2-8`), driver changes (`DP-0` vs `DP1`), GPU changes |
| Linux Wayland | Portal picks the output, no name list (Aurora-jep) | n/a |

Stable keys exist per platform: `CGDisplayCreateUUIDFromDisplayID` on
Mac, the display path id from `QueryDisplayConfig` on Windows (survives
unplug and driver reinstall), and an EDID hash plus connector on X11,
since identical monitors can share an EDID serial. On Wayland the portal's
`restore_token` restores the user's pick and no output id is exposed at
all.

- **Stable keys first, in 1.1.4 (A8), as a bug fix.** They fix
  `activeMonitorName` drifting today, and need nothing from v1. The work:
  - Repro the drift on each platform.
  - Per-platform keys as above.
  - Migrate a saved `activeMonitorName` onto the new key, so upgrading
    users keep their choice.
  - Check whether audio sinks already have stable ids (PipeWire node
    names, Windows endpoint ids, CoreAudio device UIDs, unverified here).
- **Wayland cannot select a monitor remotely.** The portal dialog picks
  the output, so "switch to the left monitor" by voice cannot work there.
  The API reports it as a capability (for example `canSelectMonitor`).
- **In v1.0 if A8 lands in time (B8), else v1.1 (C1).** `GET monitors`
  with the stable key as `id`, and `source.video.monitor` and
  `source.audio.sink` writable in `PATCH state`. Until then,
  `state.source.video.monitor` is a display label, documented as "for
  people, may change", not a key.

### Events stream
- **No replay.** Every connection starts with a full `state` snapshot, so
  `Last-Event-ID` replay buys nothing. Document that a reconnect gets a
  fresh snapshot, and that clients must not assume they saw every change.
- **Send `retry: 3000` once per connection.** Chromium and WebKit default
  to 3000 ms (`defaultReconnectDelay`), so this changes nothing for the
  WebUI there. Firefox's default was not confirmed. It gives non-browser clients
  (MQTT bridge, MCP, scripts) one documented number. (This corrects the
  earlier "2000 so browsers don't retry at their default rate".)
- **Add `Retry-After` to the 503 `too_many_streams` answer.** Today it has
  none. Browsers treat any non-200 answer as final and stop, but SSE
  libraries (Jakarta's, for one) honor `Retry-After` on 503. Same answer
  while shutting down.
- **Document the cap:** half the worker pool (`max(8, cores - 1) / 2`):
  4 up to 9 hardware threads, 7 on 16, 11 on 24. An adapter holding one
  stream is fine, and one per request is not. Low-end machines are where
  it binds.

### `apiVersion`
- **`GET /api/version` stays unversioned** and returns
  `{version, apiVersion: "1.0"}`. Docker's client probes an unversioned
  `/_ping` for the same reason: a client must learn which majors exist
  before it can choose a path.
- **SemVer for the contract:** minor for additive changes, patch for
  documentation fixes, major (a new `/api/v2`) for anything removed or
  renamed. The path carries only the major. The government and vendor API
  standards searched all do the same.
- **The OpenAPI `info.version` equals `apiVersion`.** The OpenAPI spec
  defines `info.version` as the document's version, which is the contract
  here, not the app's version.
- **No version response header.** Nothing registered exists (vendors use
  `X-API-Version`, and RFC 6648 retires the `X-` prefix). The probe and
  the spec are enough. An unknown major already answers 404.
- **When v2 exists:** add `apiVersions: ["1.3", "2.0"]` to the probe,
  keep v1 serving until adapters move, and say so in the changelog.

## Route inventory
Status: proposal.

**Public (v1):**

| Route | Today | Scope (today) | Notes |
|---|---|---|---|
| `GET state` | `/api/state` | Read | Trim fields, see below |
| `PATCH state` | `/api/state {running}` (PUT) | **Admin** | `{running, effect, brightness}` at Control |
| `GET events` | `/api/events` (SSE) | Read | Topics `state`, `health` |
| `GET capabilities` | per host `main.cpp` | Read | Move into core |
| `GET version` | per host `main.cpp` | Read | Add `apiVersion` |
| `GET effects` | `/api/effects` | Read | Add title, description |
| `GET effects/:id` | `/api/effects/:id` | Read | Returns the graph document |
| `PUT effects/:id/params` | same | Apply | Tuning a custom effect |
| `GET descriptors` | `/api/descriptors` | Read | Static per build |
| `GET nodes` | `/api/nodes` | Read | Node catalog |
| `GET graph` | `/api/graph` | Read | Running graph |
| `GET graph/presets`, `graph/presets/:id` | same | Read | |
| `PUT/GET/DELETE graph/drafts/:session` | same | Draft | |
| `POST graph/validate` | same | Draft | |
| `GET graph/preview` (SSE), `graph/preview/summary` | same | Read | |
| `POST graph/test`, `test/heartbeat`, `test/revert`, `test/confirm` | same | Apply | |
| `GET graph/test` | same | Read | |
| `POST graph/apply` | same | Apply | |

**Internal (stays unversioned):** `/api/config` (raw blob, the plan rules
it out), `PUT /api/effects` and `DELETE /api/effects/:id` (the WebUI's
switch and delete), `/api/zones*`, `/api/hue/*`, `/api/0/config`, `/api/pairing/*`
(the WebUI and the pairing flow own these, adapters use the documented
pairing request route only), `/api/reload`, `/api/state/dismiss` (banner
UX), `/api/monitors` (internal until stable keys land, then v1.0 or v1.1, see "Monitors"), `/api/stop` (quits the app), `/api/graph/test/stop` (Admin, WebUI
kill switch), `/api/linux/*`, `/api/dev/*`, `/api/test/*`.

`/api/pairing/status`, `/api/pairing/request` and
`/api/pairing/request/:pollKey` go in the spec as unauthenticated
operations: an adapter calls them before it has a token, so a client
generated from the spec needs them. Nothing else from `/api/pairing` is
public (see "Pairing routes in the spec").

## Field review: `GET state`
Status: proposal. Built by `buildStateJson` in
`core/Runtime/src/PipelineRoutes.cpp`, shared with the events stream.

| Field | Survives both-inputs? | v1 |
|---|---|---|
| `state` (`idle`, `running`, `paused`, `failed`) | Yes | Keep. Document that clients ignore unknown values |
| `paused` | Yes, but duplicates `state` | Drop from v1 (derived) |
| `effect`, `requestedEffect` | Yes | Keep. Document why they differ (fallback) |
| `mcpEffectId` | Not public. Keyed on a self-declared `X-Aurora-Client: mcp` header | Internal |
| `source.video {input, monitor}`, `source.audio {input, sink, auto}` | Yes, both can be non-null | Keep |
| `graphInputs {video, audio}` | Yes, null for built-ins | Keep, filled for built-ins too (recommendation 5) |
| `brightness` (0..1, saved value) | Yes | Keep. Document the range and that 0 means off on zero-off outputs |
| `test {active, confirmRemainingMs}` | Yes | Keep |
| `errors [{source, message, id}]` | Yes | Keep. `source` values become a documented open set |
| `conditions [{source, message}]` | Yes | Keep |
| `canStop` | WebUI host detail | Internal |
| `usesVideoInput`, `usesAudioInput` | **No.** They follow the pipeline mode, not the graph | Internal until fixed (recommendation 5) |
| `samplesZones` | Yes | Keep |
| `audioDevicesUrl` | Points at `/api/linux/audio-sinks`, an internal route | Internal |

The `health` event is `{errors, conditions}` cut from the same object, so
it follows the table above.

Event stream details to put in the spec: the first event is the current
`state`, a `: ping` comment every heartbeat, unknown `topics` ignored,
brightness changes arrive within about 1 s (polled, not signalled), and
the subscriber cap answer.

## Field review: other payloads
Status: proposal.

- **capabilities:** `inputs`, `audioInputs`, `outputs`, `zeroOffOutputs`,
  `platform` keep. `paused` drop (it is in `state`). The three hosts
  agree on the keys today, but each writes its own copy, so the
  route-walk test cannot see them from core. Move to one core helper
  taking `platform`. Input and output names are plugin names that differ
  per OS, so document them as opaque strings.
- **version:** add `apiVersion` (`"1.0"`, minor bumps for additive
  changes). Keep `version` as the app version.
- **effects:** `effects [{id, builtin}]`, `activeEffectId`, `effect`,
  `requestedEffect`. Add `title`, `description` (Aurora-mfud). Document
  the two reserved ids `builtin.video` and `builtin.audio`, and that
  `activeEffectId: ""` means the default built-in.
- **effects/:id and graph routes:** the graph document has its own
  `version: 1`. It becomes a second versioned contract inside v1: the
  spec documents the document shape, and `apiVersion` does not change when
  a node is added (the node catalog is data, served by `GET nodes`).
- **monitors:** neither `id` (the list index) nor `name` is stable
  today. Public only once stable keys land (see "Monitors").
- **descriptors:** fine as is. The float rounding (`shortestDecimal`)
  becomes a documented guarantee.
- **preview/summary, test, apply:** shapes are already agent-facing.
  Only the error envelope changes.

## Scopes
Status: proposal. Rules come from `AccessGuard::decide`
(`core/Network/src/Pairing.cpp`): without a rule, a non-GET needs Admin,
an `/api` GET needs Read. Loopback is always Admin.

| Write | Today | v1 |
|---|---|---|
| Pause or resume | Admin (no rule on `PUT /api/state`) | Control, via `PATCH state` |
| Brightness | Admin (only via `PUT /api/config`) | Control, via `PATCH state` |
| Effect switch | Apply | Control, via `PATCH state` |
| Tune a custom effect's params | Apply | Apply |
| Delete a saved effect | Apply (by prefix) | Admin, not public |
| Drafts, validate | Draft | Draft |
| Test, confirm, apply | Apply | Apply |
| Stop a test from the WebUI | Admin | Internal |

The gap matters for the first voice command: a device paired at Apply
can switch effects but cannot pause or dim. A new Control scope sits
between Draft and Apply (recommendation 3).

## Error envelope
Status: implemented in 1.1.4 (Aurora-5ipy.25) for every route under /api/.

Today there are three shapes:
- writes: `{succeeded: false, error, message?}`
- most reads: `{error}` or `{error, message}`, no `succeeded`
- validation failures: `{succeeded: false, error: "invalid_graph", valid, errors[]}`

Proposal: RFC 9457 problem details (recommendation 6). Every v1 non-2xx
body is `application/problem+json` with `type`, `title`, `status`,
`detail`, `code` and, for validation, `errors`. Every route, v1 and
internal, also carries `succeeded: false` and `error` from the same
helper. Error codes are
documented per route as an extensible list: clients handle unknown
codes by `status`. Codes already in use: `invalid_body`, `invalid_session`, `invalid_effect_id`,
`unknown_effect`, `unreadable_effect`, `builtin_effect`, `no_draft`,
`draft_too_large`, `too_many_drafts`, `invalid_graph`, `write_failed`,
`cannot_test`, `no_test`, `draft_changed`, `cannot_preview`,
`pipeline_gone`, `no_outputs`, `nothing_to_pause`, `running_bool_required`.

## Sequencing
Status: moved 2026-10-23 to [[api-v1-plan]] (release scoping, Lanes A
to C, critical path). Lane A is filed for 1.1.4.

## Sources
Status: reference.

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Swagger: Problem Details hands-on](https://swagger.io/blog/problem-details-rfc9457-api-error-handling)
- [AIP-180: Backwards compatibility](https://google.aip.dev/180)
- [AIP-134: Standard methods, Update](https://google.aip.dev/134)
- [AIP-161: Field masks](https://google.aip.dev/161)
- [RFC 7396: JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7396)
- [WLED JSON API](https://kno.wled.ge/interfaces/json-api/)
- [openHAB hueSync binding](https://www.openhab.org/addons/bindings/huesync/)
- [Home Assistant community: Hue Play HDMI Sync](https://community.home-assistant.io/t/philips-hue-play-hdmi-sync/137714)
- [Zuplo: strangler fig for API versioning](https://zuplo.com/learning-center/strangler-fig-pattern-for-api-versioning)
- [Curity: scope best practices](https://curity.io/resources/learn/scope-best-practices/)
- [Gravitee: OAuth scopes design](https://gravitee.io/corpus/gen-1403/oauth/oauth-scopes-design.html)
- [Gateway API versioning](https://gateway-api.sigs.k8s.io/concepts/versioning)
- [Home Assistant: config entry minor version](https://developers.home-assistant.io/blog/2023/12/18/config-entry-minor-version/)
- [Zalando RESTful API guidelines](https://opensource.zalando.com/restful-api-guidelines/)
- [42Crunch: empty security array](https://docs.42crunch.com/latest/content/oasv2/security/authentication/global-securityrequirement-emptyarray.htm)
- [Apple: CGDirectDisplayID](https://developer.apple.com/documentation/coregraphics/cgdirectdisplayid)
- [libdisplaydevice: Windows display paths](https://docs.lizardbyte.dev/projects/libdisplaydevice/latest/classdisplay__device_1_1WinApiLayerInterface.html)
- [Jakarta SSE event source (reconnect, Last-Event-ID)](https://jakarta.ee/specifications/platform/11/apidocs/jakarta/ws/rs/sse/sseeventsource)
- [Kubernetes status conditions (KEP-1623) explained](https://www.golinuxcloud.com/kubernetes-status-and-conditions/)
- [Buildkite: OAuth device authorization (RFC 8628 polling)](https://buildkite.com/docs/apis/oauth-device-authorization)
- [Kinde: device authorization flow](https://docs.kinde.com/authenticate/device-authorization-flow/overview/)
- [Speakeasy: security in OpenAPI](https://www.speakeasy.com/openapi/security)
- [Xygeni: unauthenticated endpoint detector](https://detectors.xygeni.io/xydocs/apisec/detectors/unauthenticated_endpoint.html)
- [xorg list: xrandr output names](https://lists.freedesktop.org/archives/xorg/2018-April/059245.html)
- [Baeldung: Linux monitor names](https://www.baeldung.com/linux/check-monitor-names)
- [Zed: macOS display ids vs UUIDs](https://git.secluded.site/zed/blob/v0.101.1/crates/gpui/src/platform/mac/screen.rs?raw=1)
- [Adventures with portals (restore tokens)](https://feaneron.com/2021/11/13/adventures-with-portals/)
- [libportal: restore token](https://valadoc.org/libportal/Xdp.Session.get_restore_token.html)
- [javascript.info: server-sent events](https://javascript.info/server-sent-events)
- [WHATWG list: SSE reconnection](https://lists.whatwg.org/pipermail/whatwg-whatwg.org/2012-April/035561.html)
- [Docker client ping and version negotiation](https://cos.googlesource.com/third_party/docker/+/refs/heads/cos/master/client/ping.go)
- [api.gov.au: API versioning](https://www.api.gov.au/sections/api-versioning.html)
- [RHOAS API standards](https://github.com/dimakis/app-services-api-guidelines/blob/main/docs/api-standards.md)
- [API Evangelist: OpenAPI versioning governance](https://apievangelist.com/2024/10/30/api-governance-policies-rules-and-guidance-for-managing-the-versioning-of-openapi-and-apis/)
- [BCC: API versioning standard](https://developer.bcc.no/apis/versioning.html)
- [Blink EventSource.cpp (defaultReconnectDelay)](https://chromium.googlesource.com/chromium/blink/+/HEAD/Source/core/page/EventSource.cpp)
- [Django OAuth Toolkit: device authorization grant](https://django-oauth-toolkit.readthedocs.io/en/latest/tutorial/tutorial_06.html)
- [Login with Amazon: device token response](https://developer.amazon.com/docs/login-with-amazon/retrieve-token-other-platforms-cbl-docs.html)
- [Kubernetes: OpenAPI v3 field validation GA](https://v1-34.docs.kubernetes.io/blog/2023/04/24/openapi-v3-field-validation-ga/)
- [KEP-2885: server-side unknown field validation](https://www.kubernetes.dev/resources/keps/2885/)
- [Apidog: OpenAPI linter setup 2026](https://apidog.com/de/blog/openapi-linter/)
- [GitLab: fine-grained personal access tokens](https://docs.gitlab.com/ee/auth/tokens/fine_grained_access_tokens.html)
- [GitLab: fine-grained PAT UX research](https://gitlab.com/gitlab-org/gitlab/-/issues/554883)
- [Gravitee: token scope ordering](https://gravitee.io/corpus/gen-1985/quantaloid/token-scope-ordering.html)
- [AIP-128: declarative-friendly interfaces](https://aip.dev/128)
- [AWS IoT: device shadow documents](https://docs.aws.amazon.com/iot/latest/developerguide/device-shadow-document.html)
- [Google Home: Brightness trait](https://developers.home.google.com/reference/kotlin/com/google/home/google/BrightnessTrait)
- [Alexa: BrightnessController](https://developer.amazon.com/docs/alexaplus/device-apis/alexa-brightnesscontroller.html)
- [Home Assistant: light.turn_on](https://www.home-assistant.io/actions/light.turn_on/)
- [openHAB: Hue CLIP v2 discussion (dimming)](https://community.openhab.org/t/philips-hue-clip-2-api-v2-discussion-thread/142111?page=15)
- [Codename One: HomeKit, Matter and Google Home mapping](https://www.codenameone.com/blog/smart-home-homekit-matter/)
- [Stripe unknown parameter error (third party)](https://drdroid.io/framework-diagnosis/stripe--sdk--an-unknown-parameter-was-included-in-the-request-b8825/)
- [SemVer 2.0.0](https://semver.org/)
- [Docker API version history snapshot](https://chromium.googlesource.com/external/github.com/docker/docker/+/v17.04.0-ce-rc2/api/swagger.yaml)
- [api-commons spectral-cli fork (maintenance claims)](https://github.com/api-commons/spectral-cli)
- [API Evangelist: forking Spectral](https://apievangelist.com/2026/07/29/i-am-forking-spectral/)
- [vacuum on pkg.go.dev](https://pkg.go.dev/github.com/justinclift-prvidr/vacuum)
- [openapi-spec-validator](https://openapi-spec-validator.readthedocs.io)
- [Chromium display_info.cc (szDevice reassignment)](https://chromium.googlesource.com/chromium/src/+/main/ui/display/win/display_info.cc)
- [OBS forum: Windows renumbering monitors](https://obsproject.com/forum/threads/any-way-to-keep-windows-from-changing-monitor-numbers-after-theyve-been-turned-off.66145/latest)
- [Microsoft: EnumDisplayDevicesW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumdisplaydevicesw)
- [Contract testing overview](https://contextqa.com/blog/what-is-contract-testing-api-microservices/)
