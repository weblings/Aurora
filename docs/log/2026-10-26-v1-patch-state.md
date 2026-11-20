# 5ipy.42: PATCH /api/v1/state (Aurora-5ipy.42)

Id: v1-patch-state

Plan B4 in [[api-v1-plan]].

## Shipped

- `PATCH /api/v1/state` at Control scope takes a merge patch of `running`, `effect` and `brightness` (percent).
  Read-only fields answer `read_only_field`, unknown ones `unknown_field`, `null` `null_not_allowed`, a wrong
  type or range `invalid_field`, a missing effect `unknown_effect`. Every issue is listed in `errors` and a 400
  writes nothing.
- One `ConfigStore::update` writes effect, brightness and `mcpEffectId` (MCP client with a custom effect only).
  Then a pause or resume goes through `setRunning`, else one submit on the shared coalescer. A paused host saves
  the effect and applies it on resume. `running: false` on an idle or failed host answers 409 `nothing_to_pause`
  before any write. The answer is 200 with the v1 state.
- A patch with `effect`, a pause or a resume stops a running light test as `superseded`. This runs before the
  reload, since a rebuilt pipeline would end it as `pipeline_gone` first. Brightness leaves the test running.
- Spec operation `patchState` and `StatePatch` schema, `openapi.json` regenerated. Catch2 covers the four
  acceptance cases plus the Control scope ordering. Windows core 464/464.

## Verified live

- Devstack with `--fake-hue` and the dummy input: brightness 40, pause, resume, built-in effect while paused,
  mixed bad body (3 issues) and a non-object body, with config unchanged after the 400s.
- Not run live: a saved custom effect and the superseded end, left to the Catch2 cases.

## Follow-ups

- Aurora-2v8l: a running `aurora-mcp.exe` fails the Windows app link, so the first devstack run used a stale exe.
- The API spec hook needs `AURORA_API_PYTHON` set to `py`'s interpreter on this machine.

- Lessons: A green build is not a fresh binary, check the launched exe's mtime ([[lesson-build-toolchain]])
