# External control planning, Muse and Hyperion survey

Id: external-control-planning

Research and planning session; no code changed. Started from "how
compatible are our plans with the Muse Gadgets SDK", widened to how any
assistant or smart-home hub would control Aurora. Decisions, phasing and
sources live once in [[external-control]]; this entry records what was
found and what changed.

## Done

- **Planning doc:** `docs/planning/ExternalControl.md` (`Id:
  external-control`, exploratory). Covers control vs. data plane,
  consumers (MCP, MQTT, Muse), transport, pause, security layers, phasing
  0–6 with per-phase tests, prior art, where adapters live.
- **Beads:**
  - `Aurora-3ddb` (P2 feature) filed: pause/resume without quitting.
    Notes carry three decisions: enforce in `PipelineHost::reload`; a save
    while paused stays paused; serve zones/monitors from disk/cache while
    paused.
  - `Aurora-70gs` (P2 bug) filed: Hue REST disables TLS verification
    (`HttpClient.cpp` `VERIFYPEER`/`VERIFYHOST` false). Reference:
    Hyperion's Signify CA + bridge-id CN check.
  - Hyperion reference notes appended to `Aurora-4zr.3`, `Aurora-4zr.4`,
    `Aurora-1t1`.
- **References:** Hyperion added to README credits and `AGENTS.md`
  related directories (MIT, consulted not depended on, notice on ports).
- **Doc ids:** `Id: monorepo-reorg` added to the 2026-09-21 log so the
  new doc can cite it.

## Decisions (owner)

- Pairing for LAN writes is enforced by default; breaking current LAN
  users once is acceptable this early. No report-only release.
- Adapters Aurora runs are supervised by Aurora (option B). Consequence:
  the MQTT bridge is a C++ helper in the CMake superbuild, not Python.
- Adapters live in-repo (`adapters/`); an HA custom integration, if ever
  needed, is the one forced separate repo (HACS layout).

## Findings

- **Muse Gadgets** (Meta, Apache-2.0): Linux SDK gives Muse shell access
  via a cloud VM; ESP32 SDK tunnels to the LAN; `skills/` are Markdown
  device recipes. Control plane only; nothing in Aurora's plans conflicts.
- **Two planes:** the HA output (`Aurora-4zr`) is data plane and stays the
  right shape; letting HA/assistants control Aurora is a REST client.
- **`/api/stop` quits the process** on all three apps, so a controller can
  stop Aurora but never restart it. Biggest gap; became `Aurora-3ddb`.
- **cpp-httplib 0.46 ships a WebSocket server** (`Server::WebSocket`);
  [[implementation-plan]]'s stretch list still says WebSockets need a new
  dependency. Not yet corrected there.
- **Hue live path is RGB mode.** `Color::brightness()` (luma) is only
  reached via `Colorimetry::toXYB()`, which has no callers; no brightness
  scale mismatch exists.
- **No master dimmer exists.** Brightness-like settings are tuning
  (`zones.gamma`, audio floor/vibrancy/RMS). Video has no floor.
- **Hyperion.ng** (MIT, C++/Qt, active): closest prior art. Ahead on
  outputs (~30, incl. DDP/E1.31/Art-Net, HA), effects, API/auth, remote
  sources. Behind on Wayland (portal/gamescope PR #2033 open), Mac audio
  (none), audio-reactive color (VU meter only). Effects are Python
  generators (scene-like), not signal interpretation. No SteamOS
  packaging, no YOLO/motion/XR.
- **Aurora's PipeWire grabber** registers no `state_changed` listener
  (only `param_changed`) and negotiates no DMA-BUF; Hyperion's PR #2033
  rediscovers the gamescope node after a stream drop and accepts LINEAR
  DMA-BUF. Possible leads for `Aurora-1t1` and the Deck plan; offered,
  not yet written into those docs.
- **Python is not preinstalled** on macOS (`/usr/bin/python3` is a CLT
  install stub) or Windows (App Installer alias to the Store).
- **openapi-generator has a `cpp-httplib-server` generator** (spec-first,
  since 7.15.0); none generates a spec from existing routes.
- **Provenance:** DDP/E1.31/Art-Net outputs and YOLO/motion nodes trace
  to agent-written research ([[open-formats-research]], node-graph pass),
  not owner requests.

## State and resume

- Uncommitted: `docs/planning/ExternalControl.md`, this log,
  `docs/log/INDEX.md`, `docs/_ids.md`, the monorepo log `Id:`, README,
  `AGENTS.md`, lessons. `.beads/issues.jsonl` was already staged before
  the session.
- Beads: live DB is ahead of the export only by the four appended notes
  (1t1, 3ddb, 4zr.3, 4zr.4). `bd export -o .beads/issues.jsonl` before
  `git add`.
- Open owner questions: brightness boost above 100 %; video brightness
  floor. Everything else in [[external-control]] is a recommendation
  awaiting phase 0.
- Offered, not done: beads for phases 2–5; [[implementation-plan]]
  WebSocket correction; [[home-assistant-output]] pointer; capture-gap
  notes in [[future-steamos-support]] / `Aurora-1t1`; borrow/avoid notes in
  [[node-graph-pipeline]].

## Lessons

- "A null pipeline is not a pause" (architecture-process.md).
- "DNS rebinding needs a hostname" (architecture-process.md).
- "macOS and Windows ship python3 as an installer prompt"
  (architecture-process.md).
- "Search same-niche prior art before generic patterns" (planning.md).
- "Agent-written research reads as owner scope unless the doc says who
  proposed it" (planning.md).
