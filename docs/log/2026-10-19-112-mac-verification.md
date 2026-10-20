# v1.1.2 Mac verification

Id: 112-mac-verification

Run 2026-10-19 on Andrews-MacBook-Air (macOS 27, Apple silicon), HEAD `d14f85b`
(1.1.2 sources). Agent-run part only: build, tests and the fake-Hue stack with
the app launched from the terminal, then Andrew's hand checks. No bead.

## Setup

- `cmake --preset mac-app` and build: `build/mac-app` was still 1.1.1 from
  September; rebuilt, `Info.plist` now 1.1.2. `/api/version` 1.1.2.
- `cmake -S core -B build/core-tests`: 369/369. `ctest build/mac-app`: 84/84.
- `tools/mac/verify-bundle.sh build/mac-app/bin/Aurora.app`: PASS (known WARNs:
  no hardened runtime, dylibs not bundled, ad-hoc signature).
- Stack: `devstack.py up --input dummy`, then input switched over REST to `mac`.

## Verified

- Pairing over the LAN IP (`192.168.0.198`): loopback `required:false`, LAN
  `required:true`; unpaired LAN read, write and pending list all 401. Request,
  approve (loopback), poll gives a token once (second poll `unknown`), token
  works as Bearer and as cookie, `paired-devices.json` written, revoke then 401.
  Deny leaves the poll `unknown`. Two same-name pending requests list as two
  entries and approving one adds one device.
- Host allowlist: `localhost` and `<hostname>.local` 200, `evil.test` 403.
- Routes: `/api/nodes`, `/api/graph`, `/api/state` return real data.
- Brightness (dummy input, 5-frame samples): 1.0 / 0.5 / 0.25 gives max channel
  0.99 / 0.50 / 0.24, linear.
- Floor at brightness 0 (floor 0.2, hold 1.5 s): `off` black, `hold` 0.200,
  `switchOff` 0.200 for the hold then black.
- Live `mac` capture (SCK under the terminal's grant): PUT 0.15 s, monitor
  `Display 1 (Primary)`, changing frames. CPU 2.1-2.5% in video mode (0.8% on
  dummy), vs 1.1.1's 3-4%. RSS 124 MB after the stress loop.
- Stress: 400 alternating Video/Audio (`mac-audio`) switches plus a pause and
  resume every fifth, 24 s, no crash, no new DiagnosticReport (the SCK teardown
  fix from [[mac-pause-verification-sck-crash]] holds under 1.1.2). Plus 200
  pause/resume pairs on dummy.
- `/api/events` sends `state` and `health` as the first events. `POST /api/stop`
  with an SSE client attached: process exits in 0.35 s, the stream closes.
  `down` leaves no listeners on 8000/8215/18245/18443.

- Confirmed by Andrew afterwards (Aurora.app, `build/mac-app`): tray, audio and
  video modes, and the secondary-device UX from a phone over both the LAN IP
  (`192.168.0.198:8215`) and `<hostname>.local:8215`. The macOS firewall was off
  (`socketfilterfw` disabled), so no incoming-connection prompt applies. The
  phone sessions used a real Hue bridge, so audio and video reach real lights.
- Permissions, `tccutil reset ScreenCapture|AudioCapture|Microphone
  com.aurora.app`, then `open Aurora.app`: `/api/state` reported `failed` with
  `permission_denied: ScreenCaptureKitGrabber ... Screen Recording` and both
  inputs still configured. Granting in System Settings recovered to `running`
  (video, then audio, then video) in about 26 s without a relaunch, for an
  `open`-launched app. Revoking again showed the banner on the phone, and a
  phone pairing request still appeared in the shell next to it. Findings for
  1.1.3 filed on Aurora-t957.

## Not verified

- Sound-driven audio output was not read by the agent (Andrew confirmed it works).
- Settings PUT coalescing reload counts (route tests cover it, as on Linux).
- Release: no signed or notarized 1.1.2 zip exists yet.

## Surprises

- One pairing run listed two devices after approving one request. A clean repeat
  and a same-name repeat each gave one; the first run also had an earlier
  abandoned request from the same name, so cause is unconfirmed.
- Python `urllib` on `/api/events` times out on the first `readline` (chunked
  read); `curl -N` shows events at once. A client artefact, not the route.
