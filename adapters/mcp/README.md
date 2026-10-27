# adapters/mcp

`aurora-mcp`: a stdio [MCP](https://modelcontextprotocol.io) server for
Aurora. The client spawns it, it speaks newline-delimited JSON-RPC on
stdin/stdout and calls Aurora's `/api/v1` REST API. No listener, no service. Decisions
and scope: [[sequence-d-planning]], [[external-control]].

## What's here

- `src/McpServer.*`: protocol logic (framing, version negotiation, tools),
  transport-free so tests script the app through an injected fetch.
- `src/main.cpp`: stdio loop, the httplib client, and `--pair`.
- `src/Pair.*`: the `--pair` token request and poll, transport-free like the server.
- Read tools: `aurora_status`, `list_nodes`, `describe_node`,
  `list_presets`, `get_preset` (the last two pass through `/api/v1/graph/presets`).
  Draft tools: `put_draft`, `set_control`, `preview` act on one draft per
  adapter process, deleted when stdin closes. `try_on_lights`, `keep`, `revert`, `apply`, `revert_effect` and the control tools `set_running`, `set_brightness`, `set_effect` (PATCH `/api/v1/state`) change the lights: a
  background thread heartbeats a test until keep or revert.

## Config

Per-client setup (Claude Code, Claude Desktop, VS Code, LAN token): [SETUP.md](SETUP.md).
Agent workflow text: `kInstructions` in `src/McpServer.cpp`, sent as `initialize` instructions.

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

## Trying the token case on one machine

- Run the gate: `python3 tools/light-viz-relay/sequence_d_gate.py` has a LAN phase.
- By hand: set `AURORA_URL` to the host's own LAN IP, not `127.0.0.1`. Aurora treats
  that address as remote and answers 401 until a token is paired. It does not
  exercise the firewall (the request still goes over loopback).
- Pair: `AURORA_URL=http://<LAN IP>:8215 aurora-mcp --pair` requests an apply token,
  waits for Approve in the WebUI banner, and prints only the token on stdout.
  `--scope draft|read` asks for less, `--name` overrides the device name.
- Scopes: `read`, `draft`, `apply`, `admin`. Draft covers `put_draft` and `set_control`;
  apply adds `try_on_lights`, `keep`, `apply`, `revert_effect`. No tool needs admin.
  The WebUI's own pairing still asks for `admin`, which the browser UI needs.
- `PipelineTests` "Every route aurora-mcp calls" pins each call's scope. Add new
  calls there, and give a new write route its own guard rule or it needs admin.

## Build and packaging

- Superbuild option `AURORA_ENABLE_MCP_ADAPTER` (default ON). Standalone:
  `cmake -S adapters/mcp -B build-mcp`.
- Windows and Mac apps stage the binary beside `Aurora` after linking. Linux
  installs it to `bin/`. Mac identity signing covers it in
  `tools/mac/bundle-dylibs.sh`.
- Keep protocol output on stdout only. Diagnostics go to stderr.
