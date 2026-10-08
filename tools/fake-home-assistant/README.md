# Fake Home Assistant server (dev-only test target)

Speaks just enough of Home Assistant's protocol for Aurora's output work
(bead `Aurora-21h`) that no HA install is needed: the WebSocket API
handshake plus a few commands, and the OAuth-style token endpoints.
Stdlib only (`python3`, no extra deps), like `tools/fake-hue-bridge` —
runs on Linux, Windows (`py`) and Mac.

Emulated behavior was read from a sparse clone of `home-assistant/core`
at pin `f66cbe4` (recorded in `fixtures.py` as `HA_CORE_PIN`); code
reading only, nothing run against a live instance. See
[[home-assistant-output]] “Findings from HA core source” and the
`home-assistant` entries in `docs/lessons/output.md`.

## Run

```sh
python3 fake_ha.py                              # ws://127.0.0.1:18123
python3 fake_ha.py --turn-on-delay 1.0 --viz-forward
```

Port `18123` is HA's own `8123` with a `1` prefix, the same trick as
fake-hue's `18443`, so both fakes run side by side:

```sh
python3 tools/fake-hue-bridge/fake_bridge.py    # https://127.0.0.1:18443
python3 tools/fake-home-assistant/fake_ha.py    # ws://127.0.0.1:18123
python3 tools/light-viz-relay/relay.py          # SSE :18245 (with --viz-forward)
```

The default dev token is `fake-dev-token` (`--access-token` changes it);
skip the browser flow entirely with `{"type": "auth", "access_token":
"fake-dev-token"}`.

## Flags

- `--turn-on-delay` (default `0.2`): seconds before a `light.turn_on`
  reply. Real HA runs `call_service` with `blocking=True`, so the result
  arrives only after the service finishes — that reply is the per-light
  “command done” signal Aurora's sender will gate on.
- `--auth-timeout` (default `10.0`): HA closes the socket if `auth`
  isn't sent within 10s. Lower it to rehearse the reconnect path fast.
- `--disconnect-after`: close each websocket N seconds after auth,
  simulating an HA restart (frequent with updates).
- `--event-burst`: `state_changed` events fired per `state_changed`
  subscription, so a reader thread can prove it drains under pressure.
- `--viz-forward` / `--viz-udp` (default `127.0.0.1:18244`): forward
  light colors to `tools/light-viz-relay` on every `turn_on`, light
  index as zone id. Fire-and-forget UDP, same shape as `DevLightTap`.

## What's emulated

- `GET /api/websocket`: `auth_required` → `auth` → `auth_ok` /
  `auth_invalid` (then close), 10s auth window, WS ping/pong.
- `get_states`: 3 color lights (`hue`/`wled`/`lifx` platforms) plus one
  `color_temp`-only light, mirroring the “filter to color modes” rule.
- `config/entity_registry/list` (and `list_for_display`): entries carry
  `platform`, for grouping Light select by integration.
- `call_service light.turn_on`: delayed reply with a `context` id,
  state updated so `get_states` shows it back, `state_changed` emitted
  to subscribers. Anything else is `service_not_found`.
- `GET /auth/authorize` + `POST /auth/token`: authorization-code and
  refresh-token grants, 30-minute access tokens, refresh bound to the
  issuing `client_id` (a different one gets `invalid_grant`), refresh
  rotation. `redirect_uri` must share `client_id` scheme and host:port.

## Deliberate deviations from real HA

- `/auth/authorize` returns the code as JSON instead of redirecting the
  browser to `redirect_uri` — scripted clients never need a browser.
- Plain `ws://` only, no `wss://` (matches the v1 plan: httplib TLS is
  out of scope until HA is a go).
- `turn_on` stores the pushed `rgb_color` verbatim; real HA converts to
  the bulb's native mode (`light/helper.py`).
- HA's 4096-queued / 1024-for-10s client drop is NOT enforced;
  `--event-burst` only supplies the pressure. A client that survives
  the burst with a draining reader is ready for the real limit.
- No persistence: lights and tokens reset on restart.

## Contents

- `fixtures.py` — HA pin, dev token, the four lights and registry
  entries. Light index doubles as the viz-relay zone id.
- `fake_ha.py` — the server. One `ThreadingHTTPServer` thread per
  connection; one worker thread per `turn_on` so pipelined calls each
  see the full delay; socket writes under a per-connection lock.
- `check.py` — stdlib-only self-check (`python3 check.py`): auth,
  bad-token close, auth timeout, states, registry platforms, delayed
  `turn_on` with state round-trip, unknown-command/ping, subscribe
  burst, and the full OAuth code → token → refresh → wrong-client_id
  sequence over both form and JSON posts.

## Keeping in sync

Run `python3 check.py` before finishing any change here.

- Behavior must track the HA pin in `fixtures.py`; if the pin moves,
  re-read `websocket_api/` + `components/auth/` and update the
  deviations list above, not just the code.
- The command set must track what `output/homeassistant` (bead
  `Aurora-4zr`) actually sends: every new command the output learns
  gets a fake handler plus a `check.py` case first.
- This tool is excluded from the CMake superbuild by design — it has
  no `CMakeLists.txt`; keep it that way.

## Not in scope

`wss://`, recorder exclusion, real-light rates, multi-output or
`https://`-URL handling (rejected until the HA output learns TLS).
