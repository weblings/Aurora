# tools/light-viz-relay — agent notes

Dev-only UDP-to-SSE relay for the standalone three.js viz tool. Standalone
Python, no build step.

- Run: `python3 relay.py` (stdlib only, no deps to install).
- Self-check: `python3 check.py` (stdlib only) -- run before finishing.
- Do NOT add a `CMakeLists.txt` or wire this into the root superbuild or
  any preset; it must stay out of shipped builds -- same rule as
  `tools/fake-hue-bridge/`.
- UDP port default (18244) must track `DevLightTapAddress`'s default in
  `output/hue/include/Aurora/Output/Hue/DevLightTap.hpp` -- if one
  changes, so does the other.
- Payload shape (`{"zones":[{"id","r","g","b"}, ...]}`) must track
  `buildDevLightTapPayload()` in `output/hue/src/DevLightTap.cpp` --
  field names deliberately match `ChannelStream` so nothing here does
  its own translation.
- Malformed/unparseable datagrams are validated (`json.loads`) and
  dropped in `udp_listener()`, never forwarded as-is -- a subscriber
  should never have to defend against garbage from this relay.
- Tasks (`bd`) and lessons (`docs/lessons/`) live at the repo root.
