# Aurora-h457: Mac audio permission becomes a daemon-pushed banner row

Id: h457-audio-permission-banner-row

2026-10-06. Mac half of [[error-overlay]]'s shell-by-cause revision, on top of
[[ja76-hold-running-reload-error]] and [[98pr-webui-banner-x]]. Built and
live-checked.

## Done

- `AudioPermissionPublisher` (`app/mac/include`, header-only, callbacks so it
  tests without a host): `publish` on false->true, `remove` on true->false,
  nothing while the flag holds, so a dismiss sticks until the condition clears
  and returns. A refused publish (host not running) retries next poll. Polled
  from the Mac tick thread in `main.cpp` via the existing
  `audioPermissionLikelyDenied`. Four Catch2 cases.
- `/api/mac/audio-status` removed; Dashboard's Mac poll and inline block
  removed (Linux's `/api/linux/audio-status` sink poll stays).
- Shell row for source `audio_permission`: short copy, Retry, Open Settings
  (`?Privacy_AudioCapture`, opens "Screen & System Audio Recording"), X.
- Retry on the audio row is the generic `POST /api/reload`. A "select the
  row's mode, then reload" Retry (`selectMode`) was built and reverted once
  the findings below showed either grant alone is enough.
- `putModeSwitch` (`CaptureSource.js`) is the toggle's save, shared by
  `DashboardScreen`.
- Dashboard heartbeat (`_onHeartbeatState`) re-runs `_loadAll` once when the
  running flags change from outside the toggle (banner Retry, tray, relaunch).
  Predates h457: the toggle only refreshed on mount and on its own clicks.

## Found

- **A grant does not revive a running grabber.** A tap created before the
  grant stayed silent with audio playing; a fresh grabber after it heard
  sound. So tjoq's "applies live" held only for a process that built its
  grabber after the grant. A plain reload rebuilds it.
- **`PUT /api/config` reloads only when the running pipeline differs from the
  new config.** Saving audio-only while audio ran rebuilt nothing, so the
  first Retry cleared nothing; `selectMode(..., {rebuild:true})` follows the
  save with `POST /api/reload`.
- **Screen Recording alone covers the audio tap** (owner confirmed on macOS
  27; with "System Audio Recording Only" off, no row, lights followed audio on
  the fake-Hue stack: zone 0 red 0.02-0.39, 111 distinct values in 8s). The
  audio-list grant alone also worked (tjoq). Not tested: audio-only user with
  both off, and audio list on with Screen Recording off.
- Plain-reload Retry rebuilds the saved mode, not the running one; they differ
  after a failed mode switch (accepted: the row for that failure is the one to
  retry).
- `devstack.py` takes the first WebUI from 8215 and execs the binary under the
  terminal's permissions, so it would hit a running real instance and never
  show a denial. Stack run by hand: fake bridge, relay, `web/demo` server, and
  an `open`-launched bundle (`--env AURORA_CONFIG_DIR`, `AURORA_DEV_LIGHT_TAP`)
  with `POST /api/hue/connection`.

## Verified

- Mac: new publisher tests pass. Node tests: audio row (Retry, Open Settings,
  X), no inline block, no Mac status fetch, Retry routing, heartbeat reload.
- Live (isolated config, `tccutil reset AudioCapture` first): one
  `audio_permission` entry ~10s after launch; dismiss held 25s while denied;
  `/api/reload` with an audio-only config cleared it and it stayed gone.
