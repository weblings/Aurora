# API v1 plan: from today's routes to a frozen `/api/v1`

Id: api-v1-plan

Status: Lane A filed for 1.1.4 (2026-10-23). Lanes B and C are plans
here, not beads yet. File Lane B when 1.1.4 is close. The reasoning for
every item is in [[api-v1-review]]. This doc only orders the work. Sizes:
S is under a day, M is one to three days.

## Release scoping
Status: owner-approved 2026-10-23.

- **1.1.4: groundwork, no public contract.** Fixes and additive changes
  to today's unversioned routes. Fits a patch release, as v1.1.2 and
  v1.1.3 did with larger features, and needs no WebUI migration. It
  stands alone if v1 slips.
- **1.2.0: `/api/v1` ships.** Declaring a public API is the point where
  SemVer starts to bind, so it gets a minor release. From then on the app
  version and `apiVersion` move separately.
- **1.2.x and later: additive v1.x.** Source selection if it missed
  v1.0, the MQTT bridge, the Muse skill. Each bumps `apiVersion` minor
  only.

**Out of scope throughout:** moving the WebUI onto `/api/v1`. It stays on
the internal routes, which is the point of the thin layer. The demo shim
only gains additive fields (effect titles, `graphInputs`).

## Lane A: groundwork (1.1.4, filed)
Status: filed 2026-10-23, labels `v1-api` and `1.1.4`, under epic
Aurora-5ipy. All independent of each other.

| Plan id | Bead | Work | Size |
|---|---|---|---|
| A1 | Aurora-5ipy.21 | `DELETE /api/effects/:id` needs Admin, not Apply | S |
| A2 | Aurora-5ipy.22 | Pairing poll contract: `interval`, `expiresIn`, `access_denied` (403), `expired_token` (410), `slow_down` (429) | S-M |
| A3 | Aurora-5ipy.23 | Events stream: `retry: 3000`, `Retry-After` on 503 | S |
| A4 | Aurora-5ipy.24 | Core helper for `capabilities`, `version`, `stop` (replaces three per-host copies) | M |
| A5 | Aurora-5ipy.25 | RFC 9457 error helper for every route, legacy keys kept, JSON 404 under `/api/` | M |
| A6 | Aurora-mfud, Aurora-5ipy.26 | Effect titles and descriptions plus graph `minorVersion` (mfud), `graphInputs` for built-ins (.26) | M |
| A7 | Aurora-m2c | Root-cause the mode toggle not changing the lights | ? |
| A8 | Aurora-5ipy.27 | Stable monitor keys, saved-name migration, `canSelectMonitor`, sink id check | M-L |

- **Start A8 first.** It needs multi-display hardware on each OS. It feeds
  only B8, so a late A8 moves source selection to v1.1 and delays nothing
  else.
- **A5 first among the route beads.** It touches every route file, so
  doing it while other work is quiet avoids merge pain, and later routes
  use the helper from the start.
- **A4 changes all three app binaries:** green CI on Linux, Mac and
  Windows plus a launch check on each.
- **A7 is open-ended.** It gates only B7.

Other 1.1.4 items, not part of this plan: Aurora-lswm, Aurora-kep2,
Aurora-51nv.

## Lane B: v1 (1.2.0, plan)
Status: plan. File as beads under Aurora-5ipy with label `v1-api` and
`1.2.0` when 1.1.4 is close.

| Plan id | Work | Size | Depends on |
|---|---|---|---|
| B0 | Owner decisions recorded in [[api-v1-review]], Aurora-5ipy.20 closed | S | done 2026-10-23 |
| B1 | Contract harness: empty `docs/api/openapi.yaml` (`info.version: 1.0.0`). `openapi-spec-validator`, pinned in a `requirements.txt` beside the spec, run in CI (path-filtered on `docs/api/`) and as a pre-commit hook (with Aurora-pa6c). Catch2 route-walk test over every `/api/v1` route both ways, including the `security: []` check. In-house response-shape checker for the schema keywords the spec uses | M | B0 |
| B2 | `Control` scope between Draft and Apply: enum, `scopeFromName`, ordering test, label in `PairedDevices` | S | B0 |
| B3 | v1 reads: `state`, `events`, `capabilities`, `version` (`apiVersion`), `effects`, `effects/:id`, `descriptors`. Thin layer in `PublicApiRoutes.cpp`, one snapshot struct with two serializers, events loop shared with a payload builder parameter. Each route's Catch2 test checks its response against the spec | M | A3, A4, A5, A6, B1 |
| B4 | `PATCH /api/v1/state` (`running`, `effect`, `brightness` 0 to 100): merge-patch, strict fields, validate all then write, one reload, Control scope. A running light test ends with `superseded`, brightness alone leaves it running | M | B2, B3 |
| B5 | Graph routes and the three pairing routes under `/api/v1`, with spec entries | M | A2, A5, B1 |
| B8 | Source selection in v1.0, only if A8 is verified when B4 lands: `GET monitors` keyed on the stable id, `source.video.monitor` and `source.audio.sink` writable in `PATCH state`, `canSelectMonitor` in capabilities | M | A8, B4 |
| B6 | Aurora-5ipy.9 close-out: field-durability review, freeze `1.0.0`, adapter-facing API doc | S | B3, B4, B5, and B8 if taken |
| B7 | Aurora-5ipy.10: MCP adapter onto `/api/v1`, then control tools (pause, brightness, effect, and source if B8 shipped) | M | B6, A7 |

- **B1 goes first.** Once the harness exists, each later bead must add
  its spec entry to pass CI, so the spec is written alongside the routes.
- **The B8 gate is checked once, when B4 lands.** A8 verified on all
  three platforms: do B8, then B6. Otherwise B8 becomes C1 and B6
  proceeds. The freeze never waits on hardware.
- **B4 is the riskiest bead.** All-or-nothing validation over
  `ConfigStore::update`, pause and resume, and coalesced reloads interact.
  It needs fake-output tests for the paused case and a devstack run with
  `--fake-hue`.
- **The stream cap is shared.** WebUI, v1 and preview streams all count
  against it, 4 on a machine with up to 9 hardware threads. B3 checks
  that one WebUI tab, one MCP client and one MQTT bridge fit, or raises
  the default.

## Lane C: after 1.2.0 (v1.x, plan)
Status: plan.

| Plan id | Work | Depends on |
|---|---|---|
| C1 | Source selection in v1.1 (`apiVersion` 1.1), only if B8 missed v1.0. Same scope as B8 | A8, B6 |
| C2 | Aurora-5ipy.11 MQTT bridge | B6 |
| C3 | Aurora-5ipy.12 Muse skill | B6 |
| C4 | Aurora-5ipy.17 zone edits while paused (internal routes, unchanged) | none |

## Critical path
Status: plan.

B1, then B3 (which also waits on A3 to A6), then B4, B6 and B7. B8 adds
one M bead between B4 and B6 only when A8 is ready in time. Lane A runs
before or beside B1 and B2, so the path is about four M beads and one S
once Lane A lands.
