# v1.1.2 Linux verification

Id: 112-linux-verification

Run 2026-10-18 on andrew-framework-12 (Linux, Wayland), HEAD `8ce9f4d`, after
Linux CI passed (build, ctest, core + parity). Covers what CI cannot: the
running app, the desktop session and a second device. No bead.

## Setup

- `build/linux-app/bin/Aurora` was from 2026-10-13 (pre-1.1.2); rebuilt with
  the venv cmake (`.venv/bin`, `cmake` is not on PATH). `~/.local/bin/Aurora`
  is the same stale binary.
- Stack: `devstack.py up --input dummy` (fake bridge, relay, app, viz), then
  inputs switched over REST.

## Verified

- Pairing over the LAN IP (`192.168.0.126`): loopback needs no pairing, LAN
  `/api/pairing/status` says required, unpaired reads and writes 401, LAN
  cannot list pending. Request, approve, poll, token works as Bearer and as
  cookie, `paired-devices.json` written, revoke then 401.
- Host allowlist: `localhost` and `<hostname>.local` 200, unknown name 403
  (env var covered in the follow-up below).
- Routes: `/api/version` 1.1.2; `/api/state`, `/api/nodes`, `/api/graph`
  return real data (brightness, effect, source monitor and sink).
- Brightness: 0.5 halves frame values (0.62 to 0.31), 0 is black, live.
- Floor at brightness 0: `off` black, `hold` 0.2, `switchOff` 0.2 for the
  1.5 s hold then black.
- Tick loop: 59.6 fps at the relay, 2.3% CPU.
- `/api/events` sends `state` and `health`; `POST /api/stop` with an SSE
  client attached exits in 0.33 s and closes the stream.
- Capture: `linux` (portal) gave changing live colours (the PUT blocked 54 s
  on the portal prompt); `x11` reported monitor `eDP-1` but frames were black,
  expected for XWayland on Wayland. Audio graph starts and reports the sink.
- Phone: with a ufw rule for 8215, a phone on the same Wi-Fi reached the
  WebUI over the LAN IP (run by Andrew).
- Follow-up run 2026-10-19, same stack and binary:
  - `AURORA_ALLOWED_HOSTS=foo.test,bar.example`: both names (and with port)
    200, `evil.test` 403, `localhost` and `<hostname>.local` still 200.
  - `zeroOffOutputs` empty for Hue is intended: `IOutput::zeroBrightnessMeansOff()`
    defaults false and no output overrides it yet ([[4zr11-floor-wiring]]).
  - Tray: the app registers a StatusNotifierItem with the gnome-shell watcher
    (Id `aurora`, Status Active, tooltip with the WebUI URL, menu at `/Menu`).
  - Audio reaction: audio mode needs `activeInputName` empty plus
    `activeAudioInputName` `linux-audio`. A synthetic kick, hat and chord loop
    played to the sink raised frame sd 5x (0.008 to 0.038, range 0.23-0.26 to
    0.16-0.31). The mean did not rise and decayed afterwards (0.25 to 0.16),
    so output follows level changes, not absolute level.
  - `<hostname>.local` resolves on the host to link-local IPv6 and the libvirt
    address `192.168.122.1`, not the Wi-Fi IPv4; the phone still reached it.
- Confirmed by Andrew after the follow-up run:
  - Real Hue bridge: audio and video both work.
  - Tray icon works.
  - Phone over `192.168.0.126`: pair, accept, deny and revoke work.
  - Phone over `<hostname>.local:8215` loads and works.
  - Audio reaction with real music and the Dashboard on the phone are fine.
  - X11 capture in an X11 session: video and audio both tested correctly.
- Agent-run X11 checks 2026-10-19 (X11 session, HDMI-0 3840x2160, fake-Hue
  stack, `x11` input, same 1.1.2 binary):
  - `/api/version` 1.1.2; `PUT` to `x11` returned in 0.06 s and frames flowed.
  - 200 alternating `x11` / `linux-audio` switches with a pause and resume
    (`PUT /api/state` `running`) every fifth, 13 s: no errors, app alive, RSS
    57 MB, frames still flowing afterwards.
  - `POST /api/stop` with an SSE client attached: exit in 0.30 s, stream
    closed; no listeners left on 8000/8215/18245/18443 after `down`.
  - CPU in video mode at 4K: `x11` 65.8% of one core vs 2.7% on the dummy
    input (15 s window after an 8 s settle, two runs: 65.7%, 65.8%). Host is
    `MediaServer` (i5-7600K, GTX 1070, the oldest box), the same one as
    [[wqzp1-x11-perf-verify]], which logged 66.7-67.7% for X11 video, so this
    matches the baseline (no regression). The 2.3% above is the Framework
    laptop on Wayland, not comparable.

## Not verified

- Nothing outstanding that needs hardware or a person. The earlier X11 gap was
  a Wayland limit (XWayland gives black frames, expected); X11 video and audio
  are now confirmed on an X11 session.
- Settings PUT coalescing: the live run (21 concurrent PUTs, no errors, newest
  value won) cannot show reload counts; the route tests prove one-in-flight
  plus one-pending (`PipelineTests.cpp`, Aurora-d6i7, Aurora-5ipy.8).

## Surprises

- `ufw` was active and blocked 8215 from other devices. A curl to the host's
  own LAN IP goes over loopback and skips the input rules, so it passed while
  the phone could not connect. Test reachability from another device.
- The `linux` portal input reports `monitor: null` in `/api/state`.
- Follow-up bead: Aurora-t957 (1.1.3), the secondary device sees nothing while
  the host awaits a portal or permission prompt (the PUT blocked 54 s).
