# Light-viz relay: HueOutput tap + UDP-to-SSE bridge + Linux dry run

Closed `Aurora-gj0.1` and `Aurora-gj0.2`, part of a larger companion-dev-tool
epic (`Aurora-gj0`, tagged `1.0.3`/`WebFakeLights`) building a standalone
three.js scene driven by real Aurora output data instead of the bundled demo
video/audio, so Mac input work (`Aurora-8mk`) can be visually checked without
physical Hue hardware. `DevLightTap`
(`output/hue/include/Aurora/Output/Hue/DevLightTap.hpp`, `src/DevLightTap.cpp`):
fire-and-forget UDP broadcast of `HueOutput::send()`'s computed per-zone
`ChannelStream`s, called unconditionally alongside the real DTLS
`streamChannels()` call so it never depends on (or perturbs) actual bridge
connectivity. Gated behind `AURORA_DEV_LIGHT_TAP` (presence-only, matching
`AURORA_DEV_FAKE_HUE`'s convention) with a separate
`AURORA_DEV_LIGHT_TAP_ADDRESS` override, default `127.0.0.1:18244`.
`tools/light-viz-relay/relay.py` (new, stdlib-only Python, sibling to
`tools/fake-hue-bridge/`): receives those UDP datagrams and re-serves them to
any number of browser tabs over Server-Sent Events (`/events`) -- SSE chosen
over WebSocket since `cpp-httplib` (core/Network) has no WebSocket support
and the need is one-directional server push only. `tools/light-viz-relay/smoke.html`:
throwaway `EventSource` diagnostic page (no three.js), for `Aurora-gj0.3`.

Verification: 7 new Catch2 tests in `output/hue/tests/DevLightTapTests.cpp`
(44/44 passing in the slice), plus a live UDP smoke test run by hand
(enabled -> datagram arrives with correct gamma-corrected values; disabled ->
nothing sent). Relay has its own stdlib-only `check.py` (4/4: single-
subscriber delivery, malformed-datagram dropping, multi-subscriber fan-out),
plus a real end-to-end run of the full chain: the compiled C++ tap binary ->
UDP -> relay -> `curl` SSE client, correct JSON observed. `smoke.html` itself
is manually reviewed only -- this build sandbox has neither a browser nor a
JS runtime to actually execute it.

Surprises: an env-var design bug caught by the live smoke test, not the unit
tests -- `parseDevLightTapAddress` was being called with
`AURORA_DEV_LIGHT_TAP`'s own value, so setting it the natural way (`=1`) got
read as a hostname and silently disabled the tap (`inet_pton` rejecting
"1"). Unit tests of the pure parsing function alone didn't catch it, since
they never exercised the constructor's actual env-var wiring -- pure-
function tests validate logic, not the call sites feeding them. Also chose
UDP over the TCP originally scoped in beads: fire-and-forget non-blocking
UDP send can't backpressure the real streaming path the way a TCP socket's
send buffer could under load.

Follow-ups, currently paused here for a Linux dry run: `Aurora-gj0.3`'s real
acceptance criteria (real X11/Pipewire capture, confirm captured content
visibly reaches the relay) needs Linux hardware this session doesn't have --
committed everything buildable/testable from macOS (`ce4f918`, `ead148a`)
and handed off with exact run instructions in the bead's notes. Resumes
with: `python3 tools/light-viz-relay/relay.py` + `AURORA_DEV_LIGHT_TAP=1`
real-capture Aurora build + open `smoke.html`, confirm colors track a real
captured region, then `bd close Aurora-gj0.3` and continue to `Aurora-gj0.4`
(4-zone entertainment config) and the `web/demo/main.js` refactor
(`Aurora-gj0.5`).

## Linux dry run (`Aurora-gj0.3`, same day, Linux box)

Setup: Ubuntu GNOME Wayland, `linux-app` rebuilt (prior binary predated the
tap), PipeWire capture via the `linux` input, tier-1 fake bridge, `relay.py`,
`--fresh`. The tap fires against the fake bridge even though DTLS never
connects: `HueOutput::send()` only needs `init()` to have built `m_streamer`
([HueOutput.cpp:112-138](../../output/hue/src/HueOutput.cpp#L112-L138)).
`smoke.html` opens straight from disk (inline script, relay sends
`Access-Control-Allow-Origin: *`) and connected first try.

New `tools/light-viz-relay/validate.py` (stdlib only): `passthrough` sits
between tap and relay as a UDP tee on :18246 and compares tap-sent vs
SSE-received byte for byte, aligned by start/end sentinel frames; `color`
checks per-zone medians against an expected solid on-screen color (names
channel swaps, reports/asserts gamma, fails on empty zone lists and on
black/white "gray").

Verification:
- Passthrough: 727/727 and 3587/3587 datagrams byte-identical, in order,
  ~60 fps at `refreshRate: 60`.
- Data shape settled for `Aurora-gj0.5`: `{"zones":[{"id","r","g","b"}]}`,
  RGB 0..1 post-gamma, no brightness or timestamps. A dropped zone appears
  once more as black on the next frame (from code, not observed live).
- Color (maximized Firefox, one full-screen zone, gamma 0): red
  0.945/0.106/0.106, green and blue symmetric, `#808080` → 0.525. All four
  fit one model — ~16% of the frame is window chrome/top bar/dock averaging
  ~0.66 — so no channel swap and gamma as configured. `color`'s strict
  red/green/blue FAILs were that contamination (a zone is a plain mean over
  its uvs); a centered zone would pass. Tracked red/blue changes at 1.5s steps.

Surprises:
- Saved `hue-credentials.json` overrides `AURORA_HUE_*` env vars: the first
  run silently used a stale real-bridge config, selection failed,
  `profiles/hue.json` became `[]`, and the tap streamed `{"zones":[]}` at
  60 fps. Use `--fresh`. Pairing in the WebUI during a `--fresh` run then
  wins the same way (picked `conf-office`, 1 channel, not the env var's
  `conf-living-room`).
- Fullscreen freezes capture: after F11, one correct frame, then stuck ~18s
  while the page kept alternating; resumed on exit. Two kiosk-mode runs
  froze the same way on Firefox's first paint (constant black, then white).
  Hypothesis: GNOME direct scanout. Filed `Aurora-1t1` (P1, 1.0.3).
- No independent check of arbitrary video is possible: Aurora exposes no
  captured frame and GNOME Wayland blocks unprompted screenshots. Filed a
  P3 frame-dump dev hook under `Aurora-gj0`.

Also filed: `Aurora-1z9` (unbounded PipeWire/portal waits can hang config
save/reload forever — flagged in MacSupport.md, never tracked; concurrent
reload during a pending dialog left as an open question) and `Aurora-u1u`
(WebUI sink field shown even when the default sink auto-resolves).

State: `Aurora-gj0.3` closed.
Resumes with: `Aurora-gj0.4` (4-zone fake-bridge config) and
the `Aurora-gj0.5` refactor. `Aurora-gj0.7` needs Linux hardware again; avoid
fullscreen there until `Aurora-1t1` is resolved.
