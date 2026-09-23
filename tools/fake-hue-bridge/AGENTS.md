# tools/fake-hue-bridge — agent notes

Dev-only tier-1 fake Hue bridge (REST stub, no DTLS). Standalone Python,
no build step.

- Run: `python3 fake_bridge.py` (needs `openssl` for first-run cert gen).
- Self-check: `python3 check.py` (stdlib only) -- run before finishing.
- Do NOT add a `CMakeLists.txt` or wire this into the root superbuild or
  any preset; it must stay out of shipped builds.
- Fixture shapes must track `output/hue/tests/ApiToolsTests.cpp` and the
  parsing in `output/hue/src/ApiTools.cpp`; keep `ent-N` vs `light-N`
  id spaces distinct.
- Daemon counterpart lives in `output/hue/src/PairingRoutes.cpp`
  (`/api/hue/link-button` passthrough + discover fake, both gated on
  `AURORA_DEV_FAKE_HUE`; address precedence: flag value >
  `AURORA_HUE_BRIDGE_ADDRESS` > default), covered by
  `output/hue/tests/PairingRoutesTests.cpp` (`ctest -R "discover|link-button").
- Tasks (`bd`) and lessons (`docs/lessons/`) live at the repo root.
