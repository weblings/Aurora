# Aurora-4xqt.7 to .12: Mac verification of Sequence D, gate 9/9, Claude Code in VS Code

Id: 4xqt12-mac-gate-and-vscode

Mac pass over D1 to D6 of [[sequence-d-planning]]. Windows results are in
[[4xqt7-mcp-adapter-skeleton]] to [[4xqt11-agent-instructions-setup]].

## Verified (Mac, arm64, `mac-app` preset)

- Build links `Aurora` and `aurora-mcp`; the post-build step stages
  `aurora-mcp` into `Aurora.app/Contents/MacOS/`. Ad-hoc signed bundle passes
  `codesign --verify --strict`.
- `ctest` 108/108, including the adapter cases.
- `sequence_d_gate.py` 9/9 on the fake-Hue stack with the `mac-audio` input:
  no-audio refusal, status and both preset, broken draft fixed from options,
  dark preview, try on lights and keep, apply, restart, `revert_effect`,
  killed client reverting through `heartbeat_lost`.
- Claude Code extension in VS Code, project `.mcp.json`: `aurora` showed
  connected in `/mcp`. Ran `aurora_status`, `list_presets`, `get_preset`,
  `put_draft`, `set_control`, `preview`, `try_on_lights`, `revert`. Test was
  reverted, not kept.

## Gate changes

- The gate waits for the stack's ports to free between phases (`down` does not
  wait, so phase 2 saw "port 18443 already in use").
- Phase 2 plays the Sequence C tone. With no sound the Mac audio capture
  delivers no buffers, the audio chain never runs, and `pulse` falls back to
  factor 1, so a draft with both brightness controls at 0 previewed bright.
- The dark-preview step asserts the preview reaches dark (brightness min under
  0.05), not that its max stays low and `reacting` is false.

## Surprises

- A fresh preview of an audio graph starts bright for about a second on Mac
  until the audio chain gets a buffer, so the 3 s summary's max and `reacting`
  include a transient. An agent previewing on a quiet Mac can misread it.
  Not fixed; no bead filed yet.
- `/mcp` is Claude Code's command and reads `.mcp.json` at session start, so
  the config written mid-session showed only in a new conversation.
  `.vscode/mcp.json` is the Copilot chat file, a different client.
- SETUP.md's Claude Desktop snippet has unescaped backslashes in the Windows
  path, which is invalid JSON. Not fixed.

## Not verified

- VS Code Copilot chat (`.vscode/mcp.json`), Claude Desktop, MCP Inspector on
  Mac, an identity-signed build with the `aurora-mcp` signing line, and
  Gatekeeper or TCC behaviour when a client spawns the helper.
- Linux. Beads .7 to .12 stay open until Linux passes.

## Lessons

- Silence on the Mac audio capture means no buffers at all, not zero-level
  buffers, so a gate or preview of an audio graph needs a real signal.
