# Aurora-4xqt.8: node and preset read tools (D2)

Id: 4xqt8-node-preset-read-tools

D2 of [[sequence-d-planning]], on the adapter from [[4xqt7-mcp-adapter-skeleton]].
Core preset route plus four read tools. Core `[Presets]`, `[Drafts]` and
`[GraphRoutes]` pass, 11 adapter cases pass (112 assertions).

## Built

- `GET /api/graph/presets` and `GET /api/graph/presets/<id>`
  (`PresetRoutes.cpp`): video, audio, both (screen colors with a bass pulse),
  spatial (scrolling rainbow, no capture input). The graph is built for the
  saved Config's outputs, else every registered one, and validated like a
  draft. Video and audio reuse the built-in graphs. Presets whose node types
  are not registered are left out (no-audio builds).
- `graphOutputNames()` in `DraftRoutes` is the one place that resolves the
  outputs a load uses. Registered in all three app mains.
- Adapter tools, all `readOnlyHint`: `list_nodes` (optional `category`
  prefix), `describe_node`, `list_presets`, `get_preset`. Results carry
  `structuredContent` plus the same JSON as text. `aurora_status` now does too.
  Bad arguments and misses are error results listing valid choices.

## Measured

- `GET /api/nodes`: 38,016 bytes for 49 nodes (largest `audio.bounce`, 2,193).
- `list_nodes` (type, purpose, ports as `name:Type`, `?` for optional inputs):
  8,599 bytes of text through the real adapter. Budget chosen: under 10,000
  bytes. `category` narrows it (`math`: 1,355 bytes). A client that reads both
  the text and the structured copy sees it twice.
- `get_preset` answers 0.9 to 1.7 KB.

## Verified (Windows, fake-Hue stack, `--input dummy`)

- Every preset validated after filling, saved as a draft, applied, and
  `GET /api/graph` showed its `controls` (video 3, audio 11, both 5, spatial 5).
- Audio and both need an audio input: with none configured apply falls back to
  `builtin.video` with the existing fallback warning. After setting
  `activeAudioInputName` both ran as themselves.
- The adapter, spawned with piped JSON-RPC against the live stack, answered all
  four tools.

## Surprises

- A range-for over `build(...)["nodes"]` iterates a destroyed temporary and
  threw only at runtime.
- `aurora-mcp.exe` stays locked while an MCP client holds it, which fails the
  `windows-app` build at the link step. Close the client's session first.

## Not verified

- Mac and Linux (platform-neutral code, no build run there).
- The spatial preset has no capture source, so Dashboard behavior for it is
  the open question in `Aurora-t9iq`.

## Lessons

- none
