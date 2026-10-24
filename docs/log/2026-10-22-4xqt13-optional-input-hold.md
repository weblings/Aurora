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
- Frozen spec "Absent data" amended in [`docs/planning/NodeGraphPipeline.md`](../planning/NodeGraphPipeline.md).
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
  param's kind (number, boolean); a wrong kind is refused with the draft unchanged.
- First version took the kind from the draft's current value. A param the draft
  had not set (e.g. `image.rescale.width`) let a string through and saved it, and
  then the real number was refused as "text". The kind now comes from the node
  type's descriptor (`/api/nodes`: float, optional-float, bool, enum), with the
  current value only as a fallback. Adapter tests 186/186; checked on the real
  catalog for unset float, bool and enum.
- `put_draft` needs no coercion: a string inside the graph gets a clear
  `param_invalid` from the loader, and `preview.seconds` is typed number.
- The preview of the `both` preset showed brightness 0.47 to 0.60, no 1.0 spikes.

## Verified: Muse client and the LAN token case (Linux, one machine)

- Muse 1.4.11 loaded the project `.mcp.json` unprompted and listed all 13 tools; its
  sandbox did not block loopback to 8215.
- From this host, `127.0.0.1:8215` answers 200 and the host's own LAN IP answers 401,
  so the token case is testable without a second device.
- Adapter on the LAN URL: no token gives "Aurora refused the request (HTTP 401). Set
  AURORA_TOKEN to a paired token."; wrong token gives the same; a token paired through
  `/api/pairing/request` and approved from loopback gives `aurora_status`, `put_draft`
  and `preview` over the LAN address, and Muse did the same with the token in env.
- Throwaway devstack config root, so no real device was paired.
- The gate gained a LAN phase (11/11 on Linux): refusals, then `draft` and `apply`
  tokens paired the way the WebUI does it. A draft token reads and drafts but is
  refused `try_on_lights`; an apply token starts and reverts a test.
- The WebUI pairing screen requests `admin` and has no scope picker, so a token an
  agent holds there is full admin. Filed Aurora-4xqt.15. The adapter's 401 message now
  says a set token may lack the access (draft vs apply).
- Not shown: the ufw path (a request to the host's own IP skips the firewall) and a
  real second device.

## Not verified

- Mac and Windows reruns with the tightened gate.
- Linux client trials: Claude Code connected (tools listed); a full prompt run, VS Code Copilot chat and MCP Inspector not done.
- ufw path of the LAN case, and a second device.

## Lessons

- A gate's "went dark" wait that passes on one frame cannot see flicker.
  Assert the state holds over a window.
- Absent on a wired input means "no new data", not "unconnected".
- Two config files, two clients: Claude Code reads `.mcp.json` (new conversation
  needed), VS Code's own chat reads `.vscode/mcp.json`. On Linux the Claude Code
  extension was the only one installed, so `.vscode/mcp.json` alone showed nothing
  in `/mcp`. `.vscode/` is gitignored; `.mcp.json` is not.
