# Real-bridge pause/resume closes Aurora-jwcd

Id: jwcd-real-bridge-pause-resume

2026-10-06, Windows + real Hue bridge. Aurora-jwcd (verify the DTLS
resume handshake and the paused-to-resumed stream on real hardware, split
from Aurora-3ddb) verified by hand and closed.

## What verified it

Two separate 5-cycle `PUT /api/state` pause/resume runs. Bulbs visibly
released on every pause and streamed again on every resume; no stuck
entertainment session, no hang. That satisfies the bead's acceptance
criteria (lights stop/restart each time, no stuck session, resume time
observed) without needing the scripted cross-check below.

## The scripted cross-check never actually ran

`tools/hue-pause-resume-check/pause_resume_check.py` was written to
independently confirm the bridge's own
`GET /clip/v2/resource/entertainment_configuration/{id}` `status` field,
not just trust Aurora's self-reported `paused`/`succeeded` fields --
matching this file's `[[external-control-beads]]` note that Hyperion's API
acks before the real outcome is known. Every run used a
`hue-application-key` from a fresh re-pairing instead of the one Aurora's
running session actually streams with: CLIP v2 refuses a fresh/wrong key
with `403` (HTML body, confirmed by web research -- `GET
/api/hue/connection` deliberately withholds the real key by design, see
`PairingRoutes.cpp`). So every bridge call 403'd for the whole session,
while Aurora's real, separately-stored session kept working the entire
time -- visible proof it genuinely paused/resumed, with a broken
diagnostic channel sitting right next to it.

A second bug compounded the first: the pause-side predicate was
`status != "active"`, and `None != "active"` is `True` in Python, so the
dead bridge channel reported a false "pause confirmed" on every cycle
instead of surfacing as a failure. Only the resume side's positive
predicate (`== "active"`) exposed that nothing was actually answering.

## Follow-up: script fixed, then ran clean

A third bug surfaced getting the real key into the script: the
`username` field commonly starts with `-`, so `--hue-key -WwOi...` reads
as argparse seeing another flag ("expected one argument"), not a value.
Fixed by using `HUE_APP_KEY=...` (or `--hue-key=...`) instead of
space-separated `--hue-key <value>`.

With the correct key: 5/5 cycles PASS, bridge-confirmed `inactive` on
every pause and `active` on every resume, resume time 0.95-1.00s
(avg 0.97s, PUT-to-active). The scripted cross-check is now the stronger
confirmation of the two -- kept as the standing regression check for any
future pause/resume or Hue-output change on real hardware, not just a
one-off for this bead.

## State left behind

- Script reports real diagnostics (HTTP status + body) instead of
  collapsing every bridge-call outcome into one boolean, and requires an
  actual successful response before counting either direction as
  confirmed.
- Script's README corrected: the real key lives in Aurora's own
  `CredentialsStore` file (`<configRoot>/hue-credentials.json`), never
  recoverable by re-pairing, and commonly starts with `-` (use `=` or the
  env var, not a space-separated flag).

## Lessons

- "`value != "expected"` is `True` when `value` is `None` -- a dead oracle
  can pass a check it never actually ran" (debugging-method.md).
- "Re-running Hue pairing to 'peek' at the app key mints a brand-new,
  unrelated bridge user" (output.md).
- "A Hue application key commonly starts with `-`, which breaks a naive
  `--flag value` CLI arg" (output.md).

## Addendum 2026-10-08: what "released" looks like

Owner observation on real bulbs: on pause they hold the last streamed color. They do not reset or return to a prior scene. Aurora sends only `action: "stop"` for the entertainment area (`ApiTools.cpp`), so the hold is the bridge's behavior. The demo's Pause matches it (Aurora-calt).
