# Fake Hue bridge (tier 1: REST only, dev-only)

HTTPS stub serving the static JSON Aurora's `output/hue` slice expects,
for development away from physical lights. Covers pairing, validation,
entertainment-config listing/selection, channel names, stream start/stop
state, and test-pulse. Does NOT emulate the DTLS entertainment stream on
UDP 2100 -- `HueOutput::init()` succeeds against it, but `isConnected()`
stays false and frame sending is a no-op (that is the documented tier-1
expectation, not a failure; the DTLS handshake failure is swallowed by
design -- see `docs/lessons/output.md`).

## Run

Requires `python3` and `openssl` (cert is generated on first run into
`.certs/`, which is gitignored -- never commit key material).

```sh
python3 fake_bridge.py                        # https://127.0.0.1:18443
python3 fake_bridge.py --port 18443 --link-button not-pressed
```

Then point Aurora at `127.0.0.1:18443` as the bridge address
(`sanitizeBridgeAddress` keeps `host:port`; the `https://` scheme is
added by Aurora itself). Any `hue-application-key` is accepted.

Options: `--username`, `--clientkey`, `--link-button pressed|not-pressed`
(`not-pressed` makes `POST /api` return bridge error 101 so the WebUI
retry path is testable).

## Quickstart: full NUX rehearsal (copy-paste)

Rebuild the daemon first so both dev routes exist, and run the new tests:

```powershell
cmake --build build/windows-app --config Release
ctest --test-dir build/windows-app -C Release --output-on-failure -R "discover|link-button"
```

Terminal 1 -- the fake, starting with the button unpressed:

```powershell
py tools\fake-hue-bridge\fake_bridge.py --port 18443 --link-button not-pressed
```

Terminal 2 -- the daemon against the fake (`--fresh` guarantees an empty
config root so the NUX runs instead of landing on the dashboard; no
`AURORA_CONFIG_DIR` juggling, and repeated runs can never re-soil each
other):

```powershell
$env:AURORA_HUE_BRIDGE_ADDRESS="127.0.0.1:18443"
$env:AURORA_HUE_USERNAME="fakedevuser01"
$env:AURORA_HUE_CLIENTKEY="00112233445566778899aabbccddeeff"
$env:AURORA_HUE_ENTERTAINMENT_CONFIG_ID="conf-living-room"
$env:AURORA_DEV_FAKE_HUE="1"
.\build\windows-app\bin\Release\Aurora.exe --fresh
```

Browser: open the WebUI URL from the daemon's terminal. Checking
auto-advances to pairing (no address typing). Then "press the button"
from devtools and hit Continue/Try again on the screen:

```js
await (await fetch('/api/hue/link-button', {
  method: 'PUT',
  body: JSON.stringify({bridgeAddress: '127.0.0.1:18443', pressed: true}),
})).json()
```

Linux equivalent (`bash`): replace `py` with `python3`, `\` with `/`,
the `$env:` lines with `VAR=value` prefixes on the daemon command, and
`--fresh` works unchanged (temp dir resolves per platform).

## "Pressing the button" from the browser console

`PUT /dev/link-button {"pressed": true|false}` flips the fake's
link-button state at runtime (also `GET` to read it), so you can rehearse
the NUX pairing wait-state without restarting the fake: start with
`--link-button not-pressed`, reach the pairing screen, then press the
button straight from devtools and hit Try again.

Same-origin convenience route on the app daemon (no CORS/cert friction):
it forwards to the fake's `/dev/link-button`. Only registered when the
daemon runs with `AURORA_DEV_FAKE_HUE` set -- production builds never
expose it:

```js
await (await fetch('/api/hue/link-button', {
  method: 'PUT',
  body: JSON.stringify({bridgeAddress: '127.0.0.1:18443', pressed: true}),
})).json()
```

`bridgeAddress` is required mid-pairing (nothing persisted yet, so the
daemon's persisted-connection fallback finds nothing); once paired you
can omit it.

## Autodetect targets the fake in dev mode

With `AURORA_DEV_FAKE_HUE` set, the daemon's `/api/hue/discover` returns
only the fake instead of asking `discovery.meethue.com` (which knows
nothing about a localhost stub). Address precedence: the flag's own value
> `AURORA_HUE_BRIDGE_ADDRESS` (already passed for the run, so normally no
second copy is needed) > the default `127.0.0.1:18443`. A bare
`$env:AURORA_DEV_FAKE_HUE="1"` works too and falls through to the same
chain -- only set an explicit value for a non-default fake port:

```powershell
$env:AURORA_DEV_FAKE_HUE="127.0.0.1:18443"
```

One bridge back means the NUX "checking" phase auto-advances straight to
pairing against the fake -- no address typing at all. Unset the variable
for production behavior.

## `conf-room-4zone`: a ready-made 4-zone config for the light-viz tool

For `Aurora-gj0` (the standalone three.js viz tool, `tools/light-viz-relay/`):
a third entertainment configuration, `conf-room-4zone`, with exactly 4
channels over 4 dedicated lamps (Front/Back Left/Right), matching
`web/demo/main.js`'s `ROOM_ZONE_MAP` quadrants one to one. Channel id ->
quadrant is a fixed decision, not derived from anything:
`0=front-left, 1=front-right, 2=back-left, 3=back-right`.

Point `AURORA_HUE_ENTERTAINMENT_CONFIG_ID=conf-room-4zone` at a `--fresh`
run to select it (`--fake-hue` on app/linux presets this plus the bridge
address/credentials/dev-discovery in one flag; see the "End-to-end viz run"
in `tools/light-viz-relay/README.md`). Aurora gives newly-discovered zones
full-frame UVs by default (`core/Runtime/src/ZoneReconciler.cpp`), so
channel count alone isn't enough to get real quadrant colors out of the
tap -- either set each zone's UVs via the WebUI's Zone Mapping screen to
match `ROOM_ZONE_MAP`, or skip that UI pass entirely by dropping
`room-4zone-zonemap.json` in as the saved zone map before first run:

```sh
mkdir -p "$AURORA_CONFIG_DIR/profiles"
cp room-4zone-zonemap.json "$AURORA_CONFIG_DIR/profiles/hue.json"
```

(Under `--fresh` the config root is the cleared temp dir, not
`$AURORA_CONFIG_DIR` -- place the file at
`/tmp/aurora-fresh/profiles/hue.json` after launching, before pairing.)

(`hue.json` because `ZoneMapStore` names the file after `HueOutput::name()`.)
That file's shape is `Aurora::Runtime::ZoneMapStore`'s exact JSON schema
(`core/Runtime/src/ZoneMapStore.cpp`) -- `check.py` validates it against
that schema (required keys, well-formed UVs, exact quadrant tiling) since
this tool has no C++ build to round-trip it through directly.

## Contents

- `fixtures.py` -- static payloads. Three entertainment configs: two
  original ones over Lamp A / Floor Lamp (`ent-1`/`ent-2`), plus
  `conf-room-4zone` over 4 dedicated quadrant lamps (`ent-3`..`ent-6`,
  see above); channel members use `ent-N` entertainment rids while light
  control uses `light-N` light rids, matching a real bridge.
- `room-4zone-zonemap.json` -- matching `ZoneMapStore`-shaped zone map for
  `conf-room-4zone`, ready to drop in as `profiles/hue.json` (see above).
- `fake_bridge.py` -- the server. Start/stop PUTs flip in-memory stream
  status per config and are logged, as are light PUTs.
- `check.py` -- stdlib-only self-check (`python3 check.py`).

## Not in scope

DTLS/UDP-2100 streaming (tier 2), `discovery.meethue.com` emulation,
state persistence. This tool is excluded from the CMake superbuild by
design -- it has no `CMakeLists.txt`; keep it that way.
