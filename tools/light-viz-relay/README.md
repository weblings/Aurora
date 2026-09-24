# Light viz relay (dev-only)

Bridges `output/hue`'s `DevLightTap` (fire-and-forget UDP, one JSON line
of computed per-zone colors per frame) to any number of browser tabs over
Server-Sent Events, so the standalone three.js viz tool
(`web/demo/viz.html`, once built) can watch real capture/output data
without a physical Hue bridge. See `docs/lessons/output.md` and
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

## Contents

- `relay.py` -- the server: one UDP socket (background thread), one
  `ThreadingHTTPServer` serving `/events` as SSE to as many subscribers
  as connect. Malformed datagrams are logged and dropped, never
  forwarded. Heartbeats (SSE comment lines) keep idle connections alive.
- `check.py` -- stdlib-only self-check (`python3 check.py`): single-
  subscriber delivery, malformed-datagram dropping, and multi-subscriber
  fan-out.

## Not in scope

Persistence/replay of past frames (a client that connects late just sees
nothing until the next datagram arrives), authentication (localhost dev
tool only). This tool is excluded from the CMake superbuild by design --
it has no `CMakeLists.txt`; keep it that way.
