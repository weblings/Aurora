# Linux verification of the changes after Sequence D (0e73051 to e1834d0)

Id: linux-post-d-verification

Linux pass over what landed after the Sequence D verification at 0e73051 (zfre, exbp, 4f6p, 2b1w, tc8w, kgv7,
r7ff, version 1.1.3). Related: [[4xqt15-scoped-agent-pairing]], [[zfre-test-state-and-stop]],
[[kgv7-pickers-follow-graph]], [[r7ff-noise-nodes]].

## Verified (Linux, `linux-app`, e1834d0, fake-Hue stack, `linux-audio` with tone)

- Build: `linux-app` links, including the zfre edit to `app/linux/src/main.cpp` (route order, `onEffectChosen`).
- ctest `linux-app` 189/189; core build 433/433 (zfre, tc8w `graphInputs`, route-to-scope cases included).
- `web/ui` and `web/demo` node tests pass.
- `sequence_d_gate.py` 11/11: strict dark preview (brightness max 0.00, `reacting` False), LAN phase on 192.168.0.126.
- Light-test lifecycle against the running app (scratch script, not committed):
  - `/api/state` `test` inactive at rest, active with a countdown during a test.
  - `graphInputs` matched each preset (video, audio, both, source-less `spatial`) during a test and was null after revert.
  - An in-place swap video test to audio test gave the new `graphInputs` and kept the test active (tc8w follow-up).
  - `POST /api/graph/test/stop`: 200, next heartbeat 404 `no_test`, `lastEnd` `stopped`; with none running 404.
  - `PUT /api/config` naming `activeEffectId` mid-test ends it as `superseded`.
  - An input-mode change (Audio toggle sets `activeInputName` empty) ends it as `pipeline_gone`.
- `aurora-mcp --pair` from a Linux client to the Linux Aurora over its LAN IP: pending entry named
  `aurora-mcp on <host> (Linux)` with `from` and scope `apply`; approval printed a token; `aurora_status` worked and
  `try_on_lights` passed the apply guard; Paired devices listed it as `apply`.
- `--pair` token across an Aurora restart (app killed and relaunched on the same config root): the `apply` token
  still worked over the LAN IP, the device stayed in Paired devices with `apply`, no token still got 401, and the
  WebUI stayed on port 8215.
- WebUI in a browser (owner-confirmed): light tests of the video, audio, both and source-less `spatial` presets
  (10 s each) showed the Stop test banner, the filled MCP toggle and the pickers and hints matching each graph.

## Not verified

- The pair request came from the host's own LAN address, so it went over loopback and skipped ufw; no second device.
- `noise` / `image.noise` live preview, Mac for everything here, and the Mac permission-blocked repro for 4f6p.

## Findings

- The built-in Audio/Video toggle changes `activeInputName` (empty is audio mode), not `activeEffectId`.
  A `PUT {"activeEffectId":"builtin.audio"}` alone leaves `effect` on `builtin.video`.

## Lessons

- none
