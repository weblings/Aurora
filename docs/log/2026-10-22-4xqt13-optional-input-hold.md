# Aurora-4xqt.13: wired optional inputs hold on Absent ticks, Linux Sequence D pass

Id: 4xqt13-optional-input-hold

Linux pass over D1 to D6 of [[sequence-d-planning]], after the Mac pass in
[[4xqt12-mac-gate-and-vscode]]. The first gate run found a flicker in
both-input graphs, fixed here.

## Found

- First gate run 8/9: the killed-client step saw the lights lit while the test
  was still active.
- Frame trace under a dark both-input test: 0.0 and 1.0 frames alternating.
  With `pulse` at 0.2 the trace was 0.2 and 1.0. No test running: steady 1.0.
  About 60% of samples lit with the gate tone, 20% without.
- Cause: all three grabbers already drain what has buffered, but PipeWire's
  period (~21 ms) outlasts a 60 Hz tick, so `audio.capture` is Absent on some
  ticks. `frame.brightnessScale.factor` is optional, and a wired-but-Absent
  input read as unconnected, so the factor fell to its default of 1.
- The gate's dark checks passed on any single dark frame, so steps 4 and 5
  passed on flickering lights. Mac's 9/9 used the same checks.

## Built

- `Graph::tick`: a wired optional input that reads Absent gets the last value
  its edge carried; never valued, it propagates Absent like a required input.
  Trigger, AudioBuffer and AudioFeatures ports are not held.
- `adoptStateFrom` carries a held value when the same source still feeds the
  same input, so an in-place swap does not drop a tick.
- Frozen spec "Absent data" amended in `NodeGraphPipeline.md`.
- Gate: dark checks require every sampled frame dark for 1 s (`stays`).

## Verified (Linux, Ubuntu, Wayland session, `linux-app` RelWithDebInfo)

- Build links `Aurora` and `aurora-mcp` into `build/linux-app/bin/`.
- `linux-app` ctest 184/184, core 425/425 with the new hold test.
- `cmake --install` puts `aurora-mcp` beside `Aurora` in `bin/`.
- `sequence_d_gate.py` 9/9 on the fake-Hue stack, `--input dummy`, audio
  `linux-audio` with the `pw-play` tone. The dark preview now reports
  `reacting` false; the flicker had made it true.

## Found in the Claude Code trial (Aurora-4xqt.14)

- `set_control` value `1.0` reached the adapter as the string `"1.0"` (the
  `value` schema had no type) and was saved, so the draft stayed invalid.
- Fix: `value` is typed number, string or boolean; a string is read as the
  param's current kind (number, boolean); a wrong kind is refused with the
  draft unchanged. Adapter test added, 185/185.
- The preview of the `both` preset showed brightness 0.47 to 0.60, no 1.0 spikes.

## Not verified

- Mac and Windows reruns with the tightened gate.
- Linux client trials: Claude Code connected (tools listed); a full prompt run, VS Code Copilot chat and MCP Inspector not done.
- LAN token case.

## Lessons

- A gate's "went dark" wait that passes on one frame cannot see flicker.
  Assert the state holds over a window.
- Absent on a wired input means "no new data", not "unconnected".
- Two config files, two clients: Claude Code reads `.mcp.json` (new conversation
  needed), VS Code's own chat reads `.vscode/mcp.json`. On Linux the Claude Code
  extension was the only one installed, so `.vscode/mcp.json` alone showed nothing
  in `/mcp`. `.vscode/` is gitignored; `.mcp.json` is not.
