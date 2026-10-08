# Hue pause/resume check (Aurora-jwcd)

Cycles Aurora's pause/resume against a **real** Hue bridge and confirms the
entertainment session actually stops and restarts on the bridge, not just
that Aurora's own state flips. Stdlib-only (urllib + ssl).

## Why bridge-side, not just Aurora's own state

The fake bridge used by `devstack.py` is REST-only and can't exercise a real
DTLS resume handshake. On a real bridge, Aurora's `GET /api/state` can say
`paused: false` while the actual entertainment stream is still coming up (or,
per Aurora-n5ly, could even report `running` against a dead bridge whose REST
calls silently no-op). This script polls the bridge's own
`GET /clip/v2/resource/entertainment_configuration/{id}` `status` field
(`active`/not-`active`) -- the same field Aurora's `ApiTools::streamingActive`
reads -- so a pass means the bridge agrees, not just Aurora.

## Status

Verified clean end-to-end on a real bridge (Aurora-jwcd, 2026-10-06), once
run with the correct key (see the credentials note above): 5/5 cycles
PASS, bridge-confirmed `inactive`/`active` transitions both ways, resume
time 0.95-1.00s (avg 0.97s). Kept as the regression check for any future
change to pause/resume or the Hue output path on real hardware.

## What it does NOT check

Whether the physical bulbs visibly went dark and came back. There's no
camera/light-sensor tooling here for that -- glance at the bulbs each cycle
yourself; the acceptance criteria in the bead ask for that too.

## Run

```sh
# PowerShell -- avoids the leading-dash argparse gotcha below
$env:HUE_APP_KEY = "<app-key>"
python pause_resume_check.py [--api http://127.0.0.1:8215] [--cycles 5]
```

- `--hue-key` / `HUE_APP_KEY` env var: the bridge's `hue-application-key`
  (the `username` field Aurora already holds from pairing). Aurora's own
  `GET /api/hue/connection` deliberately withholds it (see
  `output/hue/src/PairingRoutes.cpp`), so it has to be supplied here --
  read it from Aurora's own `CredentialsStore` file, **do not re-run
  pairing to "see it once"**: that mints a brand-new username/clientkey on
  the bridge, unrelated to the one Aurora is actually streaming with, and
  every bridge call this script makes will 403 (bridge's refused-key
  response) while Aurora's real session keeps working fine. The file is
  plain JSON at `<configRoot>/hue-credentials.json`:
  `%APPDATA%\Aurora` on Windows, `~/Library/Application Support/Aurora` on
  Mac, `~/.config/aurora` on Linux (or `$AURORA_CONFIG_DIR` if set). Copy
  its `username` field. That value commonly starts with `-` -- passed as
  `--hue-key -WwOi...`, argparse reads the leading dash as another flag
  and fails with "expected one argument". Use `--hue-key=-WwOi...` (the
  `=` form) or the `HUE_APP_KEY` env var instead, both unaffected by the
  leading dash.
- `--api`: Aurora's own WebUI/API base URL. Default assumes the first port in
  the 8215+ scan range; pass the real one if the app picked a different port.
- `--cycles`: pause/resume repeats (default 5).
- `--settle-timeout`: seconds to wait each way for the bridge status to flip
  (default 10s).

Bridge address and `entertainmentConfigurationId` are read automatically from
Aurora's `GET /api/hue/connection`.

## Output

Per cycle: whether the bridge session went inactive on pause and active again
on resume, plus the resume time (PUT /api/state to bridge-status-active).
Summary at the end with min/max/avg resume time; exits nonzero if any cycle
failed to settle within `--settle-timeout`.
