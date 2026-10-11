# Aurora-o13: video and audio capture at the same time (paused: Linux done)

Id: o13-dual-capture

2026-10-11. Spike for node prep 9: can one `Pipeline` run screen and audio
capture together on each platform? Linux works. Mac and Windows not run yet.

## Built (dev flag, spike only)

- `AURORA_DEV_DUAL_CAPTURE` (presence-only), in `core/Runtime/src/Pipeline.cpp`.
  With both `activeInputName` and `activeAudioInputName` set, `build()` makes
  the audio input + `AudioOrchestrator` first, then the video input +
  `Orchestrator`; `tick()` updates video then audio. Video stays primary for
  config apply, zones and monitors; capabilities report both inputs.
- The same flag logs per-orchestrator `update()` time every 5 s in every mode
  (`[dual-capture] <mode> ...`), so single modes give a like-for-like baseline.
- Unset flag: behaviour unchanged ("video wins if both could apply").

## Linux result: works

Ubuntu 24.04.5, GNOME 46 Wayland, PipeWire 1.0.5, i5-1334U (12 threads),
60 Hz (16.67 ms tick budget). Light-viz stack with fake Hue, `linux` (portal +
PipeWire screencast) + `linux-audio` (default sink monitor), a quiet test tone
playing. 30 s per mode, process CPU from `/proc/<pid>/stat`:

| Mode | CPU (one core) | Threads | `update()` avg / max ms |
|---|---|---|---|
| Video only | 46.4–47.5% | 20 | video 7.3–8.4 / 10.5–18.8 |
| Audio only | 3.9–4.1% | 20 | audio 0.39–0.45 / 1.7–2.3 |
| Both | 48.3–48.4% | 23 | video 7.2–7.5 / 10.8–14.3; audio 0.23–0.24 / 0.8–1.4 |

- No capture conflict: the portal session and the PipeWire audio stream run
  side by side: each grabber runs its own `pw_main_loop`, and `pw_init` is
  shared through `PipewireRuntime`, so two runtimes is already the design. Both
  sources were switched live by config PUT; no portal re-prompt.
- Cost is additive: both ≈ video + audio. Video `update()` time does not move.
- One startup outlier: audio max 46–72 ms in the first 5 s window of both
  dual runs, never again and never in audio-only. One-off; not chased.
- Video alone already uses ~45% of the tick budget on this machine. That is
  today's cost, not a dual-capture cost; it matters for graph evaluation at
  higher refresh rates.

## Which output wins: neither

Both orchestrators call `output->send()` each tick, and `HueOutput::send()`
streams every call (no latest-wins buffer). The light tap showed 47 frames/s
with both vs 23 with one source, with 27 video/audio switches per second:
the lights flicker between the two. A graph needs one sink per output that
picks or mixes before `send()`; two sources must never share an output
directly. Lesson in architecture-process.

## Resume

- Same flag on Mac and Windows: set both input names (`PUT /api/config`),
  run with `AURORA_DEV_DUAL_CAPTURE=1`, record CPU and the `[dual-capture]`
  lines for each mode. Mac: watch whether Screen Recording and the audio
  prompt can both be granted (setup only asks for one today); Windows: WGC/DXGI
  plus miniaudio loopback (loopback gives zero callbacks with nothing
  playing, see input lessons).
- Then update [[node-graph-pipeline]] and close Aurora-o13; remove or keep the
  flag per what the graph work needs.
