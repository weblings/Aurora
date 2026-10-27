# 5ipy.36: v1 spec harness (Aurora-5ipy.36)

Id: v1-spec-harness

Plan B1 in [[api-v1-plan]].

## Shipped

- `docs/api/openapi.yaml` (OpenAPI 3.2, `info.version` 1.0.0) with a generated `openapi.json` and a `--check`
  script run in `web.yml`, so C++ reads JSON and needs no YAML parser.
- `docs/api/requirements.txt` pins `openapi-spec-validator` and Schemathesis, the first pip deps, scoped to
  that directory.
- `HttpServer` gains a route listing for tests. The Catch2 route-walk fails when a `/api/v1` route lacks a spec
  operation or the reverse, and when `security: []` disagrees with the open (`Scope::None`) guard rules.
- No in-house response-shape checker: Schemathesis in the Lane B gate owns shape.
- One-route validator and Schemathesis trial passes on Windows, and later on Mac and Linux through the Lane B
  gate. On Windows the tools need `PYTHONUTF8=1` or they crash on the cp1252 console.

- Lessons: none
