# aurora-mcp client setup

`aurora-mcp` ships beside the Aurora app. Find it first, then point your
client at it. Aurora must be running.

## Where the binary is

- Windows: `aurora-mcp.exe` in the install folder, beside `Aurora.exe`.
- macOS: inside `Aurora.app/Contents/MacOS/aurora-mcp`.
- Linux: `bin/aurora-mcp` in the install prefix.

## Claude Code

```sh
claude mcp add aurora -- /path/to/aurora-mcp
```

- Or a project `.mcp.json`: `{ "mcpServers": { "aurora": { "command": "/path/to/aurora-mcp" } } }`.
- Claude Code reads it at session start, so open a new conversation, then approve the server.
- The Claude Code VS Code extension is this client too. `/mcp` in its panel lists servers.

Add `-e AURORA_URL=http://192.168.1.20:8215 -e AURORA_TOKEN=...` before the
`--` for the LAN case.

## Claude Desktop

Edit `claude_desktop_config.json` (Settings, Developer, Edit Config), then
restart Claude Desktop:

```json
{ "mcpServers": { "aurora": { "command": "C:\\path\\to\\aurora-mcp.exe" } } }
```

## VS Code (Copilot chat)

- This is VS Code's own chat, not the Claude Code extension. Claude Code ignores
  `.vscode/mcp.json`, and VS Code ignores `.mcp.json`.
- Servers show under `MCP: List Servers`; use Agent mode.

Add to `.vscode/mcp.json` (or run `MCP: Add Server` and choose a stdio server):

```json
{ "servers": { "aurora": { "type": "stdio", "command": "/path/to/aurora-mcp" } } }
```

## Muse

- Muse reads the project `.mcp.json`, so the Claude Code config above is enough.
- Server name `aurora` is reserved for `-c`; use another name there (`aurora-lights`).
- Muse treats every `env` value as a secret, so each must be a whole-value `${VAR}`,
  one `-c` per field, with the variable set in the shell:
  `-c 'mcpServers.x.env.AURORA_URL="${AURORA_URL}"' -c 'mcpServers.x.env.AURORA_TOKEN="${AURORA_TOKEN}"'`.

## Aurora on another machine (LAN)

- Loopback needs no token. A non-loopback Aurora refuses unpaired clients.
- Pair a token in the Aurora WebUI, then set it in the client's `env`:

```json
{ "mcpServers": { "aurora": { "command": "/path/to/aurora-mcp",
  "env": { "AURORA_URL": "http://192.168.1.20:8215", "AURORA_TOKEN": "<paired token>" } } } }
```

- The token goes in the client config, never in chat. The agent cannot set it.
- The link is plain HTTP, so a LAN sniffer can read the token.
- A token paired in the WebUI has full admin access, not only what the agent needs.
  Treat it like a password and revoke it under Paired devices when done.

## Check it works

Ask the agent "What is Aurora doing?". It should call `aurora_status`. If the
reply says Aurora refused the request, the token is missing or wrong. If it
cannot connect, check Aurora is running and `AURORA_URL`.
