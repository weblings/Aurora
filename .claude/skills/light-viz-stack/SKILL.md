---
name: light-viz-stack
description: Bring up / tear down the fake-Hue light viz stack (fake bridge, relay, Aurora, viz page) — use when you need a running app streaming frames without Hue hardware, e.g. to validate pipeline behavior, tray/tick-loop bugs, or the viz tool. Windows, Mac, Linux.
allowed-tools: Bash, Read
---

# Light viz stack

Plain `Aurora.exe` / `Aurora` is NOT enough: the stack is fake bridge +
relay + app launched with `--fake-hue --fresh` and `AURORA_DEV_LIGHT_TAP=1`
+ a viz web server. Use the script, don't hand-assemble it.

```sh
py tools/light-viz-relay/devstack.py up      # Windows (python3 on Mac/Linux)
py tools/light-viz-relay/devstack.py status
py tools/light-viz-relay/devstack.py down    # always tear down when done
```

By default `up` captures the live screen (`--input live`: `windows` / `mac` /
`linux`). Use `--input dummy` only when the user asks for the dummy input.
Live capture may raise a Screen Recording (Mac) or portal (Linux Wayland)
prompt the user must accept.

`up` starts everything, drops in the 4-zone zone map, sets the fake
connection and active output over REST, and waits for a frame on the SSE
(`http://127.0.0.1:18245/events`). It prints the WebUI URL (port 8215+) and
viz URL (`http://localhost:8000/viz.html`). Options: `--app PATH` (default is
`build/<platform>-app/...`, must already be built), `--viz-port`. Logs and
pids live in `<tmp>/aurora-devstack`.

Once `up` succeeds, hand the user the viz URL (and the WebUI URL) so they can
open it, and leave the stack running until they are done; run `down` only
afterwards. An agent that cannot open a browser should not stop there: confirm
frames on the SSE endpoint yourself.

## What the script encodes (do these by hand if you must)

1. Order: bridge, relay, app, zone map, viz server. `--fresh` wipes the
   config root at startup, so the zone map (`tools/fake-hue-bridge/
   room-4zone-zonemap.json` -> `<tmp>/aurora-fresh/profiles/hue.json`) goes
   in after the app is up.
2. Frames did not flow until output was activated: `PUT` (not POST)
   `/api/config` `{"activeOutputNames":["hue"],"nuxCompleted":true}` (plus
   `"activeInputName"`: `windows` / `mac` / `linux` by default, `dummy` only
   on request; an unset input leaves the pipeline idle by design), after `POST
   /api/hue/connection` with the fake credentials
   (`tools/light-viz-relay/README.md`, "On Windows").
3. Serve `web/demo/` with a `ThreadingHTTPServer` with
   `request_queue_size = 256`, never plain `http.server` (5-slot backlog
   resets viz.html's module fetches; `docs/lessons/build-toolchain.md`).
4. Windows: `py` not `python3`; `fake_bridge.py` needs `openssl`
   (`C:\Program Files\Git\usr\bin`).
5. The app log can be empty (stdout buffering); find the WebUI port by
   probing `/api/hue/connection` on 8215+, not from the log.

## Checks

- Frames all near-black/dark gray just means a dark screen; put something
  bright on it. `PUT /api/config {"activeInputName":"dummy"}` gives a
  drifting synthetic signal without depending on the screen (same as
  `up --input dummy`).
- `up` times out on a frame: read `app.log` for `Could not bind WebUI to
  0.0.0.0:8215`; a hand-launched Aurora owns the port (`lsof -nP
  -iTCP:8215 -sTCP:LISTEN`). Quit only a process you started.
- The stack's app is a child of your terminal, so on Mac it runs under the
  terminal's Screen Recording grant. Denied-state checks need `Aurora.app`
  launched on its own (`open ... --args --fresh`); the stack's bridge, relay
  and viz can stay up for it.
- No frames: check `app.log` in the state dir, then `tools/light-viz-relay/
  README.md` Troubleshooting.

## Status

Verified end to end on Windows and Mac (2026-09-29) and Linux
(2026-09-30: `up` reaches first SSE frame, full viz.html module chain +
TV_Room.glb serve 200, `down` leaves no listeners on
8000/8215/18245/18443). Mac differences the script now handles: the config
root is `$TMPDIR/aurora-fresh` (not `/tmp/aurora-fresh`; the app logs "Config
root:"), and with no input set no frames flow, so it sets `activeInputName`
to the live input (`windows` / `mac` / `linux`; Mac triggers a Screen
Recording prompt). The earlier verification runs used `dummy` on Mac/Linux;
live capture is the default since 2026-10-04; verified on Linux Wayland (`linux` input, per-zone colours). The portal dialog blocks the config PUT until accepted (120s timeout); Mac/Windows not yet re-verified.
`up --input dummy` gives the same colour on all 4 zones (drifting), so it
proves the chain but not the zone map. `validate.py passthrough` needs its own launch (tap
address env), not this stack.
