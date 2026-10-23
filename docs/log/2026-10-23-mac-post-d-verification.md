# Mac verification of the changes after Sequence D (0e73051 to e1834d0)

Id: mac-post-d-verification

Mac pass over the same set the Linux pass covered ([[linux-post-d-verification]]): zfre, exbp, 4f6p, 2b1w, tc8w,
kgv7, r7ff, 4xqt.15 (version 1.1.3).

## Verified (Mac arm64, `mac-app`, 9baa720, fake-Hue stack, `mac-audio`, dummy video input)

- Build: `mac-app` links. ctest `mac-app` 113/113; core build 433/433; web node tests and `closure-check.mjs` pass.
- `sequence_d_gate.py` 11/11: strict dark preview (brightness max 0.00, `reacting` False), LAN phase on 192.168.0.115.
- Light-test lifecycle against the running app (scratch script, not committed), same cases as Linux:
  - `test` inactive at rest; `graphInputs` matched video, audio, both and source-less `spatial` during a test, null after revert.
  - In-place video test to audio test gave the new `graphInputs`, test stayed active.
  - `POST /api/graph/test/stop` 200 and the test cleared; with none running 404.
  - `PUT /api/config` naming `activeEffectId` mid-test ended it; an `activeInputName` change ended it and moved `effect` to `builtin.audio`.
- r7ff: a draft of `image.noise` (cells 16, rateHz 6) into `zones.sample` previewed `reacting` true in all four zones with different `change` per zone.
- `aurora-mcp --pair` to the Mac Aurora over its LAN IP: pending entry `aurora-mcp on <host> (macOS)` with `from` and scope `apply`; token worked
  (`aurora_status`, `try_on_lights`). After killing and relaunching Aurora on the same config root the token still worked, the device stayed
  listed with `apply`, and no token got 401.

## Not verified

- 4f6p permission-blocked repro (Screen Recording revoked, `Aurora.app` launched on its own).
- WebUI in a browser: Stop test banner, MCP toggle fill, pickers and hints per graph shape.
- Pair request came from the host's own LAN address; no second device.

## Findings

- Relaunching the app by hand without `AURORA_CONFIG_DIR=$TMPDIR/aurora-fresh` opens the real config root (it only touched `aurora.pid`).

## Lessons

- none
