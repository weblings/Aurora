# Light-viz relay: gj0.4 fixture + frame-dump hook + validate.py frame mode

Closed `Aurora-gj0.4` and `Aurora-gj0.9`, continuing the `Aurora-gj0`
(`1.0.3`/`WebFakeLights`) epic after the Linux dry run. `Aurora-gj0.4`:
added `conf-room-4zone` to `tools/fake-hue-bridge/fixtures.py` -- a fourth
entertainment config, 4 channels over 4 dedicated quadrant lamps
(`ent-3`..`ent-6`), channel id -> `ROOM_ZONE_MAP` quadrant fixed as
0/1/2/3 = front-left/front-right/back-left/back-right. Also added
`room-4zone-zonemap.json`, a ready-made `Aurora::Runtime::ZoneMapStore`-
shaped zone map (matching quadrant uvs) so `gj0.6`/`gj0.7` can skip manual
Zone Mapping UI clicks -- drop it in as `profiles/hue.json` before first
run. `check.py` extended to validate both the new REST shape and the
zone-map file's schema/tiling by hand (33 checks total, up from 16).

`Aurora-gj0.9`: new `DevFrameDump` (`core/Runtime`), same env-gated
fire-and-forget UDP pattern as `DevLightTap` (`AURORA_DEV_FRAME_DUMP`/
`_ADDRESS`, default `127.0.0.1:18247`), hooked into `Orchestrator::update()`
right where `composeFrame()` reads the subsampled source frame. JSON+base64
payload, kept consistent with the rest of this dev-tool family. New
`validate.py frame` mode: recomputes each zone's color independently from
the raw dumped frame (exact port of `ImageProcessing::getSubImage`/
`Algorithms::mean`'s crop+mean+format-reorder math, then `HueOutput`'s
gamma step) and cross-checks against `DevLightTap`'s SSE-reported values --
works for arbitrary on-screen content, not just solid colors like `color`
mode. `check.py` gained 10 hand-computed math checks (crop bounds, BGR/RGB
reorder, degenerate zero-width uv, gamma identity/sqrt cases).

Verification: all live, not just unit-tested. `DevFrameDump` alone: 5
Catch2 tests plus socket-level smoke tests (enabled/disabled, oversized-
frame-dropped). Full integration: a combined C++ smoke binary publishing
both a `DevFrameDump` frame and matching `DevLightTap` colors, consumed
through the real relay + `validate.py frame`, five paired samples across
four zones, exact 0.0000 delta.

Surprises: the live integration test caught a real bug the unit tests
couldn't -- `DevFrameDump`'s size cap was reasoned from IPv4's theoretical
65507-byte UDP maximum, but macOS's actual enforced limit is
`net.inet.udp.maxdgram` (9216 by default, confirmed via `sysctl`), roughly
7x smaller. A 100x100 test frame (40051-byte encoded payload, comfortably
under the old cap) silently never arrived -- `send()`'s `EMSGSIZE` failure
was discarded outright, by design (`best-effort, never blocks`), so nothing
short of listening on the wire would have shown it. Cap corrected to 9000
bytes and checked against the real encoded payload rather than an
estimated raw-byte proxy. Lesson filed in `docs/lessons/debugging-method.md`.

State: `Aurora-gj0.4`/`.9` closed. `Aurora-gj0.5` (the `web/demo/main.js`
refactor) is next but was deliberately not started this session -- unlike
everything above, it has zero existing automated test coverage and needs
a real browser to verify at all, which this environment has neither of.
Noted as the sequence's stopping point on the bead itself rather than
attempted blind.
