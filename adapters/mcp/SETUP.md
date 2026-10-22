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

Add `-e AURORA_URL=http://192.168.1.20:8215 -e AURORA_TOKEN=...` before the
`--` for the LAN case.

## Claude Desktop

Edit `claude_desktop_config.json` (Settings, Developer, Edit Config), then
restart Claude Desktop:

```json
{ "mcpServers": { "aurora": { "command": "C:\path\to\aurora-mcp.exe" } } }
```

## VS Code

Add to `.vscode/mcp.json` (or run `MCP: Add Server` and choose a stdio server):

```json
{ "servers": { "aurora": { "type": "stdio", "command": "/path/to/aurora-mcp" } } }
```

## Aurora on another machine (LAN)

- Loopback needs no token. A non-loopback Aurora refuses unpaired clients.
- Pair a token in the Aurora WebUI, then set it in the client's `env`:

```json
{ "mcpServers": { "aurora": { "command": "/path/to/aurora-mcp",
  "env": { "AURORA_URL": "http://192.168.1.20:8215", "AURORA_TOKEN": "<paired token>" } } } }
```

- The token goes in the client config, never in chat. The agent cannot set it.
- The link is plain HTTP, so a LAN sniffer can read the token.

## Check it works

Ask the agent "What is Aurora doing?". It should call `aurora_status`. If the
reply says Aurora refused the request, the token is missing or wrong. If it
cannot connect, check Aurora is running and `AURORA_URL`.
