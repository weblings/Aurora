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

`python3 tools/light-viz-relay/devstack.py up` (`down` to stop) automates all
steps below; the manual steps document what it does.

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
# 3. The app, clean-room against the fake. --fake-hue (all three platforms,
#    Aurora-zx4) sets, only where unset: AURORA_HUE_BRIDGE_ADDRESS=127.0.0.1:18443,
#    AURORA_HUE_USERNAME=fakedevuser01, AURORA_HUE_CLIENTKEY=<a fixed dev value>,
#    AURORA_HUE_ENTERTAINMENT_CONFIG_ID=conf-room-4zone, and -- easy to miss,
#    this is what actually makes the WebUI's own bridge-discovery step find
#    the fake instead of trying real network discovery -- AURORA_DEV_FAKE_HUE=1.
#    See app/*/include/Aurora/App/FakeHue.hpp for the literal values if you
#    need to set any of these by hand instead (e.g. no --fake-hue support on
#    your platform yet, or scripting against a prebuilt binary). --fresh
#    wipes the config root to a temp dir:
AURORA_DEV_LIGHT_TAP=1 ./build/linux-app/bin/Aurora --fake-hue --fresh    # Linux
AURORA_DEV_LIGHT_TAP=1 ./build/mac-app/bin/Aurora.app/Contents/MacOS/Aurora --fake-hue --fresh   # Mac
$env:AURORA_DEV_LIGHT_TAP="1"; .\build\windows-app\bin\Release\Aurora.exe --fake-hue --fresh     # Windows (see "On Windows" below)
```

```sh
# 4. Room-quadrant zone map (else all 4 zones default to full-frame UVs
#    and show identical colors). --fresh clears its temp root at startup,
#    so place this AFTER launching the app, BEFORE pairing in the WebUI:
# (Mac: the root is $TMPDIR/aurora-fresh, not /tmp -- the app logs "Config root:")
R=${TMPDIR:-/tmp}/aurora-fresh
mkdir -p "$R/profiles"
cp tools/fake-hue-bridge/room-4zone-zonemap.json "$R/profiles/hue.json"
```

5. Serve `web/demo/` (`python3 -m http.server`, any port if 8000 is taken),
   open `viz.html` in a browser -- room renders, status reads "waiting for
   frames", lamps dark.
   (If you are an agent that cannot open a browser, hand the user the
   viz URL instead of stopping: they open it, you keep driving the
   processes and confirm frames on the SSE endpoint.)
6. Pair in the app's WebUI, then drag a colorful window through the
   captured region: all 4 lamps track it live.

### On Windows

Verified end to end on Windows (`Aurora-gj0.10`); the tap has a real
Winsock implementation as of that bead. What differs from the Linux flow:

- `py` instead of `python3`. `fake_bridge.py` shells out to `openssl` for its
  cert -- Git for Windows ships one at `C:\Program Files\Git\usr\bin`; add it
  to `Path` if the bridge fails to start.
- The `--fresh` config root is `%TEMP%\aurora-fresh`, so step 4 is
  `Copy-Item tools\fake-hue-bridge\room-4zone-zonemap.json $env:TEMP\aurora-fresh\profiles\hue.json`
  (create `profiles\` first if absent).
- `--fresh` opens the WebUI in your default browser, and its first-run flow
  can write credentials that beat `--fake-hue`'s config id (observed:
  `conf-living-room` instead of `conf-room-4zone`; see the "Saved Hue
  credentials silently beat `AURORA_HUE_*` env vars" lesson). If
  `GET /api/hue/connection` doesn't say `conf-room-4zone`, `POST` it back:
  `{"bridgeAddress":"127.0.0.1:18443","username":"fakedevuser01","clientkey":"00112233445566778899aabbccddeeff","entertainmentConfigurationId":"conf-room-4zone"}`
  to `/api/hue/connection` on the WebUI port from the app log.
- Serve `web/demo/` with a server that has a real accept backlog, not
  `py -m http.server` -- see Troubleshooting.
- `validate.py frame` works too (`Aurora-gj0.11` gave `DevFrameDump` its
  Winsock port): launch the app with both `$env:AURORA_DEV_LIGHT_TAP="1"` and
  `$env:AURORA_DEV_FRAME_DUMP="1"`, then
  `py tools\light-viz-relay\validate.py frame --zonemap tools\fake-hue-bridge\room-4zone-zonemap.json`.
- On a slow machine `viz.html` can take ~30s before it even requests its
  scripts; Edge worked where Firefox did not (cause not isolated).

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

## Test pattern page (`pattern.html`)

Gives capture something known to look at (`Aurora-d0hl`, built for `Aurora-1t1`).

- Open it directly in a browser; no server needed.
- Cycles a solid full-screen color (default red,blue every 1500ms) with a
  frame counter and a 50ms wall clock, so a stale captured frame shows an old
  counter even when the color happens to match.
- Params: `?interval=MS`, `?colors=red,blue,00ff00` (names or hex), `?kiosk`.
- Click or press `f` to toggle fullscreen (no F11 needed).
- Fullscreen freeze repro (`Aurora-1t1`): `devstack.py up`, open the page,
  `python3 validate.py color --expect red` while it shows red, then fullscreen
  it and watch whether the zones keep following red/blue.

## Troubleshooting

- viz.html stays dark ("waiting for frames"): isolate relay vs page with
  one SSE sample (`curl -N http://127.0.0.1:18245/events`). Frames here
  mean the pipeline is live and the problem is the tab; nothing here means
  Aurora isn't emitting (check the tap env var and the app log). Pairing is
  NOT required for frames -- under `--fake-hue --fresh` the tap streams
  pre-pairing; the pairing step only rehearses NUX.
- viz.html stuck on "connecting..." (never "connection error"), and the
  browser console shows `Loading failed for the module ... three.module.js`
  (Firefox) or `net::ERR_CONNECTION_RESET` (Edge/Chrome): the page script
  died before opening the SSE stream, and the relay is fine (no client ever
  connects to :18245). Cause on a slow Windows box: `python -m http.server`
  accepts only 5 pending connections and resets the burst of module fetches.
  Serve `web/demo/` with a `ThreadingHTTPServer` subclass setting
  `request_queue_size = 256` (see the `http.server` lesson in
  `docs/lessons/build-toolchain.md`). `smoke.html` here (open it directly
  from disk) shows the same live data with no modules or WebGL, to prove the
  pipeline independently of the 3D page.
- Silent relay while everything else is green (bridge streaming, channels
  listed, hue registered): check the tap is implemented for your platform
  before anything else -- see the "platform stub that compiles to a no-op"
  lesson in `docs/lessons/output.md`.
- No-browser capture check: `PUT /api/config {"activeInputName":"dummy"}`
  should turn SSE uniform and drifting (the dummy signature); switch back
  to the platform input to restore varied static colors. Proves
  capture-to-SSE end to end without opening a tab. (All three app shells
  register `"dummy"`.)
- App log empty when backgrounded (Linux): stdout block-buffers to file;
  prefix `stdbuf -o0 -e0`, or find the WebUI port via `ss -ltnp`.

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
- `pattern.html` -- full-screen color cycle + counter/clock for capture
  debugging (see above).

## Keeping in sync

Run `python3 check.py` before finishing any change here. For the whole stack
(bridge + relay + app + viz) use `devstack.py up|status|down` or the
`light-viz-stack` skill rather than hand-assembling it.

- The default UDP port (18244) must track `DevLightTapAddress`'s default in
  `output/hue/include/Aurora/Output/Hue/DevLightTap.hpp`; change one, change
  the other.
- The payload shape (`{"zones":[{"id","r","g","b"}, ...]}`) must track
  `buildDevLightTapPayload()` in `output/hue/src/DevLightTap.cpp`. Field names
  deliberately match `ChannelStream`, so nothing here translates.
- `udp_listener()` validates (`json.loads`) and drops malformed datagrams;
  never forward them, so a subscriber never has to defend against garbage.
- `validate.py frame`'s UDP port default (18247) must track
  `DefaultDevFrameDumpPort` in `core/Runtime/include/Aurora/Runtime/DevFrameDump.hpp`.
  It's a separate channel straight to `validate.py`, never through `relay.py`.
- `crop_mean_rgb()` / `expected_after_gamma()` in `validate.py` must match
  `ImageProcessing::getSubImage` / `Algorithms::mean`
  (`core/Processing/src/ImageProcessing.cpp`) and `HueOutput::toChannelStream`
  (`output/hue/src/HueOutput.cpp`) exactly: truncating (not rounding) uv->pixel
  conversion, per-channel mean, format-aware BGR/RGB reorder, uint8 truncation
  before normalization, then gamma.
- The `DevFrameDump` size cap is checked against the real encoded payload size
  (macOS's real UDP limit is `net.inet.udp.maxdgram`, 9216 by default, far
  under IPv4's 65507). `send()` failures are silent by design, so if the cap or
  the payload overhead changes, re-verify live; a wrong cap doesn't show up as
  an error.

## Not in scope

Persistence/replay of past frames (a client that connects late just sees
nothing until the next datagram arrives), authentication (localhost dev
tool only). This tool is excluded from the CMake superbuild by design --
it has no `CMakeLists.txt`; keep it that way.
