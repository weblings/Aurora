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
- `conf-room-4zone` (4 channels, `room-4zone-zonemap.json`) is for
  `Aurora-gj0`'s light-viz tool -- channel id -> `ROOM_ZONE_MAP` quadrant
  is fixed (0/1/2/3 = front-left/front-right/back-left/back-right,
  `web/demo/main.js`). `room-4zone-zonemap.json`'s shape must track
  `Aurora::Runtime::ZoneMapStore` (`core/Runtime/src/ZoneMapStore.cpp`);
  `check.py`'s zonemap checks validate the JSON schema by hand since this
  tool has no C++ build to round-trip it through.
- Daemon counterpart lives in `output/hue/src/PairingRoutes.cpp`
  (`/api/hue/link-button` passthrough + discover fake, both gated on
  `AURORA_DEV_FAKE_HUE`; address precedence: flag value >
  `AURORA_HUE_BRIDGE_ADDRESS` > default), covered by
  `output/hue/tests/PairingRoutesTests.cpp` (`ctest -R "discover|link-button").
- Tasks (`bd`) and lessons (`docs/lessons/`) live at the repo root.
