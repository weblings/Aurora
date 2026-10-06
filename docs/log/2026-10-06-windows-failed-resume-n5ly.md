# Windows failed-resume verification closes Aurora-n5ly

Id: windows-failed-resume-n5ly

2026-10-06, Windows 11 + real Hue bridge. Aurora-n5ly (failed resume stays paused, tray and Dashboard, by hand) verified and closed.

## Surprise first: a dead bridge cannot fail a resume

Unplugged the bridge's Ethernet while paused, resumed via `PUT /api/state`: HTTP 200 `succeeded:true` in 6.3s, app running. Chain: REST returns nothing → `loadEntertainmentConfigurations` returns an empty map without throwing (`ApiTools.cpp`) → `selectEntertainmentConfiguration` returns false on the empty map, ignored by `HueOutput::init` → `Streamer` ctor swallows the DTLS failure (recorded lesson) → `PipelineHost::resume` only fails on a `Pipeline::build` throw, and nothing threw. The 6.3s was REST timeouts on the way to success. So the bead's suggested injection (kill the bridge) can never produce a failed resume, fake or real; the app reports running while streaming into the void (`isConnected()` still unchecked anywhere — known, unchanged).

## What actually verified it

Failure injected by breaking the input config on disk (`activeInputName: "nope"`, backup first — `setRunning` reloads from disk on every resume). Tray Resume: console `Resume failed, staying paused: Unknown input 'nope'`, menu label stayed Resume, `GET /api/state` still `paused:true`. Dashboard Resume: button stayed Resume with "Couldn't resume Aurora.". Restored backup, resume succeeded (`input='windows'`), app stayed up throughout.

## Footnotes

- `activeAudioInputName` is a separate key the video build never reads — a mid-test audio resume succeeding against the broken video config was correct, not self-healing.
- New `tools/failed-resume-check/failed_resume_check.py` (stdlib-only): automates pause / failure-probe / recovery asserts plus bridge process management, prompts for the two manual UI clicks. `--self-test` passes against correct and regression-simulating stubs; real `fake_bridge.py` start/stop cycled live. Localhost urllib calls bypass `http_proxy` (sandbox/proxy envs hijack loopback otherwise). Limitation as shipped: its bridge-down injection cannot fail current code (above) — it needs a config-break mode to stay useful.
- Open product gap, not filed: resume against a dead bridge reports running with no tray/log/Dashboard signal of any kind.
