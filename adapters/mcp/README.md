# adapters/mcp

`aurora-mcp`: a stdio [MCP](https://modelcontextprotocol.io) server for
Aurora. The client spawns it, it speaks newline-delimited JSON-RPC on
stdin/stdout and calls Aurora's REST API. No listener, no service. Decisions
and scope: [[sequence-d-planning]], [[external-control]].

## What's here

- `src/McpServer.*`: protocol logic (framing, version negotiation, tools),
  transport-free so tests script the app through an injected fetch.
- `src/main.cpp`: stdio loop and the httplib client.
- Read tools: `aurora_status`, `list_nodes`, `describe_node`,
  `list_presets`, `get_preset` (the last two pass through `/api/graph/presets`).
  Draft tools: `put_draft`, `set_control`, `preview` act on one draft per
  adapter process, deleted when stdin closes. `try_on_lights`, `keep`, `revert`, `apply`, `revert_effect` change the lights: a
  background thread heartbeats a test until keep or revert.

## Config

- `AURORA_URL`: default `http://127.0.0.1:8215`.
- `AURORA_TOKEN`: optional bearer token for a non-loopback Aurora. Set by the
  user in the client config, never by the agent. Loopback needs none.

Claude Code:

```sh
claude mcp add aurora -- /path/to/aurora-mcp
```

Any client, as a config entry:

```json
{ "mcpServers": { "aurora": { "command": "/path/to/aurora-mcp", "env": { "AURORA_URL": "http://127.0.0.1:8215" } } } }
```

## Build and packaging

- Superbuild option `AURORA_ENABLE_MCP_ADAPTER` (default ON). Standalone:
  `cmake -S adapters/mcp -B build-mcp`.
- Windows and Mac apps stage the binary beside `Aurora` after linking. Linux
  installs it to `bin/`. Mac identity signing covers it in
  `tools/mac/bundle-dylibs.sh`.
- Keep protocol output on stdout only. Diagnostics go to stderr.
