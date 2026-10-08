# Node and HA prep: scoping, HA core read, bead sequences

Id: node-ha-prep-sequencing

Planning session, no code changed. Drafted the 1.0.5 CHANGELOG entry, scoped
audio device selection, read HA core source, and filed sequenced beads for
node prep and the HA output.

## Audio device selection (Aurora-9k1)

- Default capture differs per platform (lesson filed in input.md):
  - Mac: global tap, every app on any device.
  - Linux: default sink, resolved once at start.
  - Windows: default playback loopback (probably follows default changes;
    unverified).
- Linux's dropdown lists every sink but stores one name in
  `audioTargetSinkName`.
- Options appended to 9k1's notes, **no design decision made**:
  - Single pick vs N devices: N needs a list in config, a mixer, and about
    +1 day.
  - The first option's label differs per platform.
  - Per-app capture is out of scope.
- 9k1 now depends on Aurora-kea, whose shared frontend gate is 9k1's step 1.

## Node prep findings

- `Pipeline`/`PipelineHost` are copied in all three app `main.cpp` files
  (about 250 lines each). Hot tuning, the capability Dashboard and the dual
  capture spike all change that code, so moving it into core comes first.
- Every `PUT /api/config` calls `PipelineHost::reload()`, which rebuilds
  outputs (Hue DTLS, 1-3s).
  - Hot candidates: the 11 `audio*` fields, `transitionSmoothing`,
    `interpolation`.
  - Need checking: `refreshRate`, `subsampleWidth`.
- The Dashboard gates sections on `mode`, derived from config. The sink field
  is gated on `'linux-audio'` and fetches `/api/linux/audio-sinks`.
- `Pipeline::build` picks one input ("video wins"). Video and audio capture
  have never run together.
- Race noted: settings PUT saves `config.json` outside PipelineHost's lock,
  and `Pipeline::build` saves derived values too.
- cpp-httplib 0.46 has a ws *server* (`Server::WebSocket`). Its thread pool
  is at least 8 threads and can grow 4×, so a few streaming clients won't
  starve the API.

## HA core read (`../core`, sparse, `f66cbe4`)

Findings written into [[home-assistant-output]] "Findings from HA core
source"; two lessons filed in output.md:

- **Login flow:** works with a LAN `host:port` client_id; tokens are tied to
  that client_id.
- **WebSocket:** `call_service` is blocking, and HA drops slow readers.
- **Color:** HA's `rgb_color` conversion is confirmed.
- **mDNS:** the advertisement includes `internal_url` and `uuid`.
- **Entity registry:** listed in one reply.

`home-assistant/addons` (cloned first) is the HA OS add-on store, not core.

Gaps found while sequencing:
- **Security:** the API is unauthenticated on 0.0.0.0, so it needs
  hardening before any HA token exists.
- **Light restore:** lights must be restored on stop (HA doesn't do it the
  way the Hue bridge does).
- **Automations:** they can fight Aurora.
- **Black frames:** `brightness: 0` turns lights off (not verified in
  code).
- **mDNS:** a new dependency on Linux/Windows.
- **Testing:** Docker HA only offers demo lights. Seeing them in the light
  viz needs a `state_changed` → relay bridge script.

## Beads

- **node-prep:**
  - Sequence: Aurora-lzw → Aurora-9ig → Aurora-7r3. Aurora-c0g, Aurora-kea
    and Aurora-o13 each come after 9ig.
  - Labels added to 7r3 and lzw.
  - Notes on 9ig/c0g/kea/o13 point at the overlapping beads 4g2, kwn, nzd,
    cgr, vf1.2, vf1.4 and 4y9.
- **ha-prep:** ready now are Aurora-5i3 (API hardening, P2), Aurora-21h (fake
  HA server), Aurora-2dz (secret store) and Aurora-cyw (color split +
  scheduler). Aurora-d7s (Output section) waits on kea.
- **ha-output:** epic Aurora-4zr, children .1-.9: skeleton → connection →
  sender → restore → Connect → Light select → Change output, then Docker and
  real-bulb validation. Build only once HA is a go.

## Resume

`bd ready --label node-prep` (lzw first) or `bd ready --label ha-prep`.
