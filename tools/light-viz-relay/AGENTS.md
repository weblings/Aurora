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
- `validate.py frame`'s UDP port default (18247) must track
  `DefaultDevFrameDumpPort` in
  `core/Runtime/include/Aurora/Runtime/DevFrameDump.hpp`. This is a
  separate channel straight to `validate.py`, never through `relay.py`
  -- raw pixel data doesn't fit `relay.py`'s JSON-line/SSE shape.
- `crop_mean_rgb()`/`expected_after_gamma()` in `validate.py` must track
  `ImageProcessing::getSubImage`/`Algorithms::mean`
  (`core/Processing/src/ImageProcessing.cpp`) and `HueOutput::toChannelStream`
  (`output/hue/src/HueOutput.cpp`) exactly -- truncating (not rounding)
  uv->pixel conversion, per-channel mean, format-aware BGR/RGB reorder,
  uint8 truncation before normalization, then gamma. A live datagram-size
  bug was found here empirically, not by reasoning: macOS's real UDP limit
  is `net.inet.udp.maxdgram` (9216 by default), well under IPv4's
  theoretical 65507 max that the size cap was originally (wrongly) based
  on -- `DevFrameDump`'s cap is checked against the real encoded payload
  size now, not an estimate. Re-verify live (send() failures are silent,
  by design, so a wrong cap doesn't show up as an error) if that cap or
  the payload's overhead ever changes.
- Tasks (`bd`) and lessons (`docs/lessons/`) live at the repo root.
