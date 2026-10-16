# B1: read routes GET /api/nodes and GET /api/graph (Aurora-id8j.2)

Id: id8j2-b1-read-routes

Closed 2026-10-16. First read surface of [[nodes-agent-ux]] Sequence B, behind
the EC 3 Host allowlist ([[5ipy4-ec3-host-allowlist]]).

## Done

- `GET /api/nodes`: every registered node type in registration order with
  purpose, useWhen, example, cost, ports (type, required) and params (kind,
  schema, enum options). Built once per build from the same registrations the
  runner uses (audio nodes only in audio builds).
- `GET /api/graph`: `{"graph": <doc>}` for the running pipeline, `null` when
  idle, failed or paused. The doc is the built-in graph with the Config
  overlay, rebuilt on demand by `GraphRunner::graphJson()`.
- Routes live in `GraphRoutes.cpp`, registered next to `registerStateRoute`
  in the three app mains. `shortestDecimal` is now shared from
  `ControlDescriptors.hpp`.
- Tests: both routes in `PipelineTests.cpp`, including a forged Host (403).
- Windows MSVC Debug: core suite 253/253.
- Lessons: 1 (language-cpp, const json `operator[]` aborts Debug tests).

## Carried forward

- `output.send` sets no `sinkBindingParam`, so the loader's one-sink-per-output
  check is inert and `/api/nodes` omits `sink` for it. Not changed here.
- Built-in graphs carry no `controls` yet (B4).
- App mains were edited but not built here (only core tests on Windows).
