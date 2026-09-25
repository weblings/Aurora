# Light viz relay (dev-only)

Bridges `output/hue`'s `DevLightTap` (fire-and-forget UDP, one JSON line
of computed per-zone colors per frame) to any number of browser tabs over
Server-Sent Events, so the standalone three.js viz tool
(`web/demo/viz.html`) can watch real capture/output data without a
physical Hue bridge. See `docs/lessons/output.md` and
`output/hue/include/Aurora/Output/Hue/DevLightTap.hpp` for the tap side.

## Run

Requires only `python3` (stdlib only, no extra deps).

```sh
python3 relay.py                        # UDP in :18244, SSE out :18245/events
```

Then run Aurora with the tap enabled, pointed at this relay's default UDP
port (which is also `DevLightTap`'s own default, so no extra env var is
needed unless you're running multiple relays at once):

```sh
AURORA_DEV_LIGHT_TAP=1 ./Aurora
```

## End-to-end viz run (no Hue hardware needed)

Three processes plus a browser tab, in order. This is the `Aurora-gj0.7`
validation flow; an agent with no prior context can run it as written.

```sh
# 1. Fake bridge (default https://127.0.0.1:18443, link button pressed):
python3 tools/fake-hue-bridge/fake_bridge.py
```

```sh
# 2. This relay (UDP :18244 in, SSE :18245 out):
python3 tools/light-viz-relay/relay.py
```

```sh
# 3. The app, clean-room against the fake (--fake-hue presets the bridge
#    env + dev discovery; --fresh wipes the config root to a temp dir):
AURORA_DEV_LIGHT_TAP=1 ./build/linux-app/bin/Aurora --fake-hue --fresh
```

```sh
# 4. Room-quadrant zone map (else all 4 zones default to full-frame UVs
#    and show identical colors). --fresh clears its temp root at startup,
#    so place this AFTER launching the app, BEFORE pairing in the WebUI:
mkdir -p /tmp/aurora-fresh/profiles
cp tools/fake-hue-bridge/room-4zone-zonemap.json /tmp/aurora-fresh/profiles/hue.json
```

5. Serve `web/demo/` (`python3 -m http.server`), open `viz.html` in a
   browser -- room renders, status reads "waiting for frames", lamps dark.
   (If you are an agent that cannot open a browser, hand the user the
   viz URL instead of stopping: they open it, you keep driving the
   processes and confirm frames on the SSE endpoint.)
6. Pair in the app's WebUI, then drag a colorful window through the
   captured region: all 4 lamps track it live.

No app build needed for a synthetic check (skips steps 3-4, 6): with only
the relay running, send one JSON frame per UDP datagram to `127.0.0.1:18244`
(`{"zones":[{"id":0,"r":1,"g":0,"b":0}, ...]}` -- numeric channel ids,
RGB 0..1 already gamma-corrected). `viz.html` shows the frame on arrival;
late joiners see nothing until the next datagram (no replay, by design).
`smoke.html` in this dir shows the same data as raw colored divs.

Options: `--host` (default `127.0.0.1`), `--udp-port` (default `18244`,
must match `AURORA_DEV_LIGHT_TAP_ADDRESS` if that's overridden),
`--http-port` (default `18245`).

## Subscribing from a browser

```js
const source = new EventSource('http://127.0.0.1:18245/events');
source.onmessage = (event) => {
  const { zones } = JSON.parse(event.data);
  // zones: [{id, r, g, b}, ...] -- same shape as ChannelStream
};
```

Any number of tabs can subscribe at once (fan-out); each gets every
datagram the relay receives from the moment it connects.

## Validating a live run

`validate.py` checks a real Aurora + relay (not a self-check):

```sh
# Sent vs received, byte for byte: validate.py tees the tap's UDP into the relay
AURORA_DEV_LIGHT_TAP=1 AURORA_DEV_LIGHT_TAP_ADDRESS=127.0.0.1:18246 ./Aurora
python3 validate.py passthrough --seconds 10

# Values vs what's on screen (solid full-screen color; primaries are gamma-invariant)
python3 validate.py color --expect red              # also green / blue
python3 validate.py color --expect gray             # neutral check + reports implied gammaFactor
python3 validate.py color --zone 0=red --zone 1=blue  # split screen: per-zone mapping
python3 validate.py color                           # no expectation: just print per-zone values

# Values vs an independent recomputation from the raw captured frame --
# works for arbitrary (not just solid-color) content, unlike `color`
AURORA_DEV_FRAME_DUMP=1 ./Aurora   # alongside AURORA_DEV_LIGHT_TAP=1 above
python3 validate.py frame --zonemap ../fake-hue-bridge/room-4zone-zonemap.json
```

`passthrough` sends a start/end sentinel frame (`{"zones":[], "_validate":...}`)
through the relay to align the two recordings; open viz pages see those as
empty frames.

`frame` reads `output/hue`'s `DevLightTap`-reported zone colors over SSE
(same as `color`) *and* `core/Runtime`'s `DevFrameDump`-reported raw
captured frame over its own UDP port (`AURORA_DEV_FRAME_DUMP`, default
`18247` -- a separate channel straight to this tool, not through
`relay.py`, since raw pixel data doesn't fit `relay.py`'s JSON-line/SSE
shape the way per-zone colors do), then recomputes each zone's color from
the frame using the exact same crop+mean+gamma math
`ImageProcessing`/`HueOutput` use, and compares the two. `--zonemap` needs
a `ZoneMapStore`-shaped JSON file so it knows each zone's uvs/gamma --
`tools/fake-hue-bridge/room-4zone-zonemap.json` is a ready-made one.
Datagrams over ~9000 bytes (encoded) are dropped by the tap itself, not
fragmented -- confirmed live against macOS's actual `net.inet.udp.maxdgram`
(9216 by default, well under IPv4's theoretical max), so keep subsample
width sane if `frame` reports fewer frames than expected.

## Contents

- `relay.py` -- the server: one UDP socket (background thread), one
  `ThreadingHTTPServer` serving `/events` as SSE to as many subscribers
  as connect. Malformed datagrams are logged and dropped, never
  forwarded. Heartbeats (SSE comment lines) keep idle connections alive.
- `check.py` -- stdlib-only self-check (`python3 check.py`): single-
  subscriber delivery, malformed-datagram dropping, multi-subscriber
  fan-out, and the `frame` mode's crop/mean/gamma math against hand-
  computed values.
- `validate.py` -- live-run validation (see above), stdlib only.

## Not in scope

Persistence/replay of past frames (a client that connects late just sees
nothing until the next datagram arrives), authentication (localhost dev
tool only). This tool is excluded from the CMake superbuild by design --
it has no `CMakeLists.txt`; keep it that way.
