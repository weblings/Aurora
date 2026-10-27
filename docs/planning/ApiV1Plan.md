# API v1 plan: from today's routes to a frozen `/api/v1`

Id: api-v1-plan

Status: Lane A filed for 1.1.4 (2026-10-23), A9 to A16 added from the
Lane A review (2026-10-24). Lane B filed for 1.1.4 (2026-10-25) after a
read of the route code, which changed the bead list. Lane C is a plan
here, not beads yet. The reasoning for every item is in [[api-v1-review]].
This doc only orders the work. Sizes: S is under a day, M is one to
three days.

## Release scoping
Status: revised 2026-10-25. The 2026-10-23 split put `/api/v1` in 1.2.0.
The owner moved Lane B into 1.1.4.

- **1.1.4: Lanes A and B.** Groundwork on today's unversioned routes,
  then `/api/v1` itself. The app version and `apiVersion` are separate
  numbers, and clients key on `apiVersion`, which starts at `1.0.0`. The
  project already ships features in patch releases (v1.1.2, v1.1.3), so
  1.1.4 carries both lanes. B8 (source selection) missed its gate on
  2026-10-26 and moved to C1.
- **After 1.1.4: additive v1.x.** Source selection (C1), the MQTT
  bridge, the Muse skill. Each bumps `apiVersion` minor only.

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
| A9 | Aurora-5ipy.28 | WebUI tuning resolves the saved monitor by key, then name | S |
| A10 | Aurora-5ipy.29 | X11 key is the EDID hash, connector only for duplicate EDIDs | S |
| A11 | Aurora-5ipy.30 | A saved monitor name is rewritten to its key on build | S |
| A12 | Aurora-5ipy.31 | `canSelectMonitor` is static per host, in `/api/capabilities` | S |
| A13 | Aurora-5ipy.32 | Snake_case error codes for reload, state and test-pulse failures, text in `message` | S |
| A14 | Aurora-5ipy.33 | CI path filters cover `adapters/**`, manual trigger for branch runs | S |
| A15 | Aurora-5ipy.34 | `lane_a_gate.py`: Lane A contracts on a running app, the launch check per OS | S |
| A16 | Aurora-5ipy.35 | Windows monitor key from the EDID, not the port-bound device path (found in the Windows A8 pass) | S |

- **Start A8 first.** It needs multi-display hardware on each OS. It feeds
  only B8, so a late A8 moves source selection to v1.1 and delays nothing
  else.
- **A5 first among the route beads.** It touches every route file, so
  doing it while other work is quiet avoids merge pain, and later routes
  use the helper from the start.
- **A4 changes all three app binaries:** green CI on Linux, Mac and
  Windows plus a launch check on each.
- **A7 is closed.** Aurora-m2c was closed as not reproducible
  (2026-10-24), so B7b no longer waits on it.
- **A9 to A16 came from the Lane A review and the Windows A8 pass.** A9 to A11 and A16 block A8
  (Aurora-5ipy.27), and A14 and A15 block A4 (Aurora-5ipy.24), since
  they carry those beads' CI and launch-check acceptance.

Other 1.1.4 items, not part of this plan: Aurora-lswm, Aurora-kep2,
Aurora-51nv.

## Lane B: v1 (1.1.4, filed)
Status: filed 2026-10-25, labels `v1-api` and `1.1.4`, under epic
Aurora-5ipy.

| Plan id | Bead | Work | Size | Depends on |
|---|---|---|---|---|
| B0 | Aurora-5ipy.20 | Owner decisions in [[api-v1-review]] | S | closed |
| B1 | Aurora-5ipy.36 | Spec harness: OpenAPI 3.2 `docs/api/openapi.yaml` (`info.version: 1.0.0`) with a generated `openapi.json` and a `--check` script in CI, pinned `requirements.txt` (openapi-spec-validator, Schemathesis), a route listing on `HttpServer`, Catch2 route-walk both ways including `security: []`. One-route trial on each OS | S | none |
| B1h | Aurora-5ipy.37 | Pre-commit hook for the spec | S | B1, Aurora-pa6c |
| B2 | Aurora-5ipy.38 | `Control` scope between Draft and Apply: enum, name table, ordering test, `aurora-mcp --pair --scope control` | S | none |
| B3a | Aurora-5ipy.39 | Core refactor: one `registerPublicApiRoutes` call in the three `main.cpp`, one `ReloadCoalescer` per host shared by settings, effects and v1, state snapshot struct, events loop with a payload builder | M | none |
| B3 | Aurora-5ipy.40 | v1 reads: `state` (adds `configuredInputs`, brightness 0 to 100), `events`, `capabilities`, `version` (`apiVersion`), `effects`, `effects/:id`, `descriptors`, with spec entries and a stream-cap check | M | B1, B3a |
| B5 | Aurora-5ipy.41 | Graph routes and pairing status/request under `/api/v1` from an explicit list, each with its access rule | S-M | B1, B3a |
| B4 | Aurora-5ipy.42 | `PATCH /api/v1/state` (`running`, `effect`, `brightness`): merge-patch, strict fields, validate all then write, one reload, Control scope. A running light test ends with `superseded` | M | B2, B3 |
| B7a | Aurora-5ipy.43 | `aurora-mcp` moved onto `/api/v1` | S-M | B3, B5 |
| B7b | Aurora-5ipy.10 | MCP control tools: pause, brightness, effect | S-M | B4, B7a |
| B8 | Aurora-5ipy.44 | Moved to C1 (gate missed 2026-10-26). Was: `GET monitors` on the stable id, `source.video.monitor` and `source.audio.sink` writable in `PATCH state` | M | A8, Aurora-ecl5, Aurora-h06o, Aurora-9fn3, B4 |
| B9 | Aurora-5ipy.45 | `lane_b_gate.py` (stdlib only) plus a Schemathesis step, on each OS | S-M | B4, B5, B7b |
| B6 | Aurora-5ipy.9 | Freeze `1.0.0`: field-durability review, adapter-facing API doc | S | B3, B4, B5, B7b, B9 |

- **Layers.** The spec owns the shape of every v1 route.
  openapi-spec-validator checks the spec. Catch2 owns route logic and the
  route-to-spec match. Schemathesis owns responses against the spec, edge
  case inputs and 5xx, run from a venv built from `docs/api/requirements.txt`
  (`--phases examples,coverage --checks response_schema_conformance,not_a_server_error`).
  `lane_b_gate.py` owns behavior, scopes over the LAN address, the `/api/v2`
  JSON 404 and the launch check. There is no in-house response-shape
  checker.
- **Why B3a exists.** The three `main.cpp` files wire about 30 routes by
  hand. B3a is the only Lane B bead that edits them, so it needs green
  CI and a launch check on all three OSes. It also fixes the effect
  switch, which reloads outside the coalescer today.
- **B5 copies an explicit route list.** Guard rules match path prefixes,
  so a copied route needs its rule or it falls to Admin, and a prefix
  copy would expose `graph/test/stop`.
- **B7a moves before the freeze** so a real client exercises the contract
  first. `aurora_status` reads `configuredInputs` from v1 state instead
  of `/api/config`.
- **The B8 gate was checked when B4 landed (2026-10-26) and missed.** A8
  was unverified on Mac and X11 and the monitor-rebuild beads were open,
  so B8 became C1 and B6 proceeds. The freeze never waits on hardware, so
  B6 does not depend on B8 in the beads.
- **B4 is the riskiest bead.** All-or-nothing validation over
  `ConfigStore::update`, pause and resume, and coalesced reloads interact.
  It needs fake-output tests for the paused case and a devstack run with
  `--fake-hue`.
- **The stream cap is shared.** WebUI, v1 and preview streams all count
  against it, 4 on a machine with up to 9 hardware threads. B3 checks
  that one WebUI tab, one MCP client and one MQTT bridge fit, or raises
  the default.

## Lane C: after 1.1.4 (v1.x, plan)
Status: C1 is Aurora-5ipy.44 (the former B8 bead). Aurora-5ipy.11 and .12
already exist. All three wait on the freeze (Aurora-5ipy.9, B6).

| Plan id | Work | Depends on |
|---|---|---|
| C1 | Aurora-5ipy.44 Source selection in v1.1 (`apiVersion` 1.1), moved from B8 when its gate missed. Same scope | A8, Aurora-ecl5, Aurora-h06o, Aurora-9fn3, B6 |
| C2 | Aurora-5ipy.11 MQTT bridge | B6 |
| C3 | Aurora-5ipy.12 Muse skill | B6 |
| C4 | Aurora-5ipy.17 zone edits while paused (internal routes, unchanged) | none |

## Critical path
Status: filed.

B3a, then B3, B4, B7b, B9 and B6. B1, B2 and B3a run in parallel first, and
B5 runs beside B3. B7a runs beside B4. B8 missed its gate and moved to C1.
That is two M beads and three S or S-M beads.
