# 5ipy.45: Lane B gate (Aurora-5ipy.45)
Id: v1-lane-b-gate

Plan B9 in [[api-v1-plan]].

## Shipped

- `tools/light-viz-relay/lane_b_gate.py`, stdlib only on the devstack: pause and resume move the fake bridge's stop and start counts, brightness dims and restores with the stream untouched, a saved effect switches the lights, a light test ends `superseded` on an effect change but not on brightness, Control and Draft tokens over the LAN address, JSON 404 on `/api/v2`.
- Last step runs Schemathesis from a venv built from `docs/api/requirements.txt` (`--phases examples,coverage`, `response_schema_conformance,not_a_server_error`) and fails on its exit code. `PYTHONIOENCODING=utf-8` is set since its banner crashes on a cp1252 console.
- The first run found two defects, both fixed. `POST /api/v1/pairing/request` threw (500) on a non-string `scope` or `name`, now 400 `invalid_json` with a PairingTests case. The `Event` schema typed SSE `data` as an object, now a JSON string with `contentSchema` `anyOf` State and Health (a state document also fits Health, so not `oneOf`). `openapi.json` regenerated.
- Windows: gate 8/8 PASS, core 465/465. Mac not run.
- Linux (2026-10-26, HEAD cfa79396): gate 8/8 (Schemathesis 387 cases pass), `gen-openapi.py --check` clean, `linux-app` ctest 197/197, `AuroraMcpTests` 32 cases pass, standalone core 464/464.
- One Linux-only failure, a test bug: the v1 capabilities case assumed `Registry::outputNames()` order, which is unordered (libstdc++ gave `out-b, out-a`). Now compared as a set with `hue` last.
- Not run on Linux: live `aurora-mcp` pairing and control tools, a second LAN device (the scopes step used the host's own IP, over loopback).

- Lessons: none
