# Aurora-4xqt.11: agent instructions and client setup (D5)

Id: 4xqt11-agent-instructions-setup

D5 of [[sequence-d-planning]], on the tools from [[4xqt8-node-preset-read-tools]]
to [[4xqt10-try-apply-tools]]. 24 adapter cases pass (225 assertions).

## Built

- `kInstructions` (sent as `initialize` instructions) now carries the full
  workflow: status first, start from a preset, change little, keep controls,
  silence holds the last frame, validate then preview, try on lights or ask
  before apply. Every tool name was checked against the tool list.
- `adapters/mcp/SETUP.md`: config snippets for Claude Code, Claude Desktop and
  VS Code, binary location per OS, and the LAN token case.

## Manual eval (Claude Code, Windows, fake-Hue stack with `--audio-input`)

Run by the same agent that wrote the tools, so it flatters first-try validity.
Server was the new build, reconnected via `/mcp`. 10 prompts, 9 valid first try.

| # | Prompt | First try | Notes |
|---|--------|-----------|-------|
| 1 | follow my screen | valid | video preset as is, preview not reacting (static screen) |
| 2 | pulse with the bass | valid | both preset, preview reacting |
| 3 | slower, paler rainbow | valid | spatial preset plus two `set_control` calls |
| 4 | warm tint on the screen | valid | needed `describe_node` and a constant-color trick (lfo into gradient), tint visible |
| 5 | slow warm breathing | valid | from scratch, brightness 0.19 to 0.89 |
| 6 | hue spins with treble | valid | not previewed |
| 7 | more vivid screen colors | valid | |
| 8 | shift hues toward green | invalid | guessed `frame.hue`, error listed `frame.hueShift`, fixed next call |
| 9 | music colors, calmer | valid | audio preset, `beat.brightnessSmoothTime` 0.6, preview reacting |
| 10 | music colors locked to blue | valid | `drift.fixedAnchorHue` 210 accepted, but preview mean was teal (r 0.06, g 0.32, b 0.21), so valid is not correct |

- `try_on_lights` started and `revert` ended it.
- Prompt 10 shows validity is not success: the control took 210 and the color
  was not blue. Likely the anchor pairs with a complement or bounce shifts it.
  Not investigated.
- Gap (filed as Aurora-9lmv): no constant Angle or Color node, so a fixed color needs an lfo into a
  gradient. Worth a node or a `color` param later.

## Not verified

- **Claude Desktop and VS Code setup were not tested.** The SETUP.md snippets for
  both are unverified. Only Claude Code was run.
- Claude Desktop is not installed on this machine, so its setup is untried.
- VS Code 1.143 is installed, but its MCP chat UI can't be driven from here,
  so the `.vscode/mcp.json` snippet is untried. The binary, env vars and
  stdio handshake behind both snippets are the same ones Claude Code ran.
- Eval was one client (Claude Code) and the same agent that wrote the tools.
