# Aurora-4xqt.7: MCP adapter skeleton (Windows verified, Mac and Linux open)

Id: 4xqt7-mcp-adapter-skeleton

D1 of [[sequence-d-planning]]. Bead left open: Mac and Linux are unverified.

## Built

- `adapters/mcp`: hand-rolled stdio MCP server `aurora-mcp`, nlohmann for
  JSON and httplib for the REST client. `McpServer` is transport-free (one line
  in, at most one out) with an injected fetch; `main.cpp` is the stdio loop.
- Protocol: `initialize` echoes a supported version (2025-06-18, 2025-03-26,
  2024-11-05) else offers the latest, and returns server instructions.
  `ping`, `tools/list`, `tools/call`, `notifications/initialized`. Batches
  are rejected (dropped from the spec in 2025-06-18).
- `aurora_status` reads `/api/state`, `/api/capabilities`, `/api/graph/test`.
  Reports state, running, paused, effect, requestedEffect, fallback
  (requested differs from running), inputs, outputs, errors, activeTest.
  Unreachable, refused or non-JSON replies are `isError` tool results.
- `outputs` is the compiled-in list from `/api/capabilities`: `/api/state`
  carries no active-output list.
- Env: `AURORA_URL` (default `http://127.0.0.1:8215`), optional
  `AURORA_TOKEN` sent as Bearer.
- Superbuild option `AURORA_ENABLE_MCP_ADAPTER` (default ON). Windows and Mac
  apps stage the binary after linking (a same-file no-op on Windows, where
  both land in `bin/<Config>`). Linux installs it to `bin/`.
  `tools/mac/bundle-dylibs.sh` signs it inside-out for identity builds.

## Verified (Windows)

- 7 Catch2 cases: framing, malformed input, version negotiation, tools/list,
  live state, fallback and active test, error results. Pass standalone and
  from the `windows-app` preset's ctest.
- MCP Inspector CLI: `tools/list` and `tools/call aurora_status` against the
  fake-Hue devstack (dummy input) returned live state.
- Claude Code in VS Code via a project `.mcp.json`: `aurora_status` returned
  the same state. The file holds a machine-specific path, so it is excluded
  in `.git/info/exclude`.
- Full `windows-app` Release build links both `Aurora.exe` and `aurora-mcp.exe`.

## Not verified

- Mac and Linux builds, Inspector on both, and the Mac identity-signing change.

## Lessons

- none

## Carried forward

- Close the bead after Mac and Linux builds and an Inspector run on each.
  Then fold in any finding and update this entry.
