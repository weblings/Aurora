# Aurora-o13: video and audio capture at the same time (paused: Linux, Mac capture done)

Id: o13-dual-capture

2026-10-11. Spike for node prep 9: can one `Pipeline` run screen and audio
capture together on each platform? Linux works. Mac capture works under the
terminal's grants (2026-10-12); Mac bundled-identity permissions and Windows
not finished.

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

## Mac result (2026-10-12): capture works, permission matrix open

macOS 27, Apple silicon, `mac-app` rebuilt at f0d501f (the build on disk
predated the spike). Run through `devstack.py up` with the flag exported, so
the app was a child of the terminal and used **the terminal's Screen
Recording and audio grants** (already held). A looping 440 Hz tone played
throughout; same display; 60 Hz (16.67 ms budget); CPU from `top -l 4 -s 5`
after the mode switch settled (`ps %cpu` is a lifetime average, not used).

| Mode | CPU (one core) | Threads | `update()` avg / max ms |
|---|---|---|---|
| Video only | ~19% | 16 | video 4.0-4.1 / 6.2-6.3 |
| Audio only | ~3.5% | 17 | audio 0.47-0.57 / 0.8-1.0 |
| Both | 24-26% | 19 | video 4.1-4.3 / 6.2-6.4; audio 0.26-0.27 / 0.55-1.5 |

- Cost is about additive (19 + 3.5 = 22.5 vs 25 measured). Video `update()`
  does not move; audio `update()` is cheaper in dual (0.27 vs 0.55 ms),
  not chased.
- One outlier: video max 48.6 ms in the 5 s window that spanned the switch
  into dual mode (a rebuild, not steady state). Did not recur in 3 further
  windows.
- Both sources deliver real data: audio-only gave 0 light frames/5 s in true
  silence and ~250/5 s with the tone (the first "tone off" count of 252 was
  a leftover `afplay` loop, not a finding); video-only gave distinct
  per-zone colours.
- Output interleave confirmed on Mac: ~520 frames/5 s with both vs ~252
  (audio-only) and ~257 (video-only). Same as Linux; platform-independent.
- Live switching video-only / audio-only / both by `PUT /api/config` worked
  with no relaunch.
- `GET /api/mac/audio-status` is 404 on this build. Not a regression:
  Aurora-h457 (96b9982, 2026-10-06) removed it on purpose; the audio
  denial is now a daemon-pushed `audio_permission` host error (see
  `/api/state` `errors`). The 2026-10-05 note in Aurora-kea that it
  answered predates that.

**Permission matrix: not finished.** Reset `ScreenCapture`, `AudioCapture`
(and, by mistake, `SystemPolicyAllFiles`) for `com.aurora.app`, relaunched
`Aurora.app` via `open` with both input names set. The PUT returned in 2 s
(it did not block on a prompt); `/api/state` went `failed` with
`permission_denied: ... no shareable displays` (the expected first-request
result for Screen Recording, dialog arriving out of band). Remaining: record
which dialogs appear and in what order, grant, retry, confirm both captures
deliver under the bundled identity, measure CPU there. Aurora-h457 found
that Screen Recording alone covers the audio tap and that a grant reaches a
rebuilt grabber, not a running one, so expect to need `POST /api/reload`
after granting.

## Which output wins: neither

Both orchestrators call `output->send()` each tick, and `HueOutput::send()`
streams every call (no latest-wins buffer). The light tap showed 47 frames/s
with both vs 23 with one source, with 27 video/audio switches per second:
the lights flicker between the two. A graph needs one sink per output that
picks or mixes before `send()`; two sources must never share an output
directly. Lesson in architecture-process.

## Resume

- Mac: finish the bundled-identity permission matrix (above). Windows: not run.
- Same flag on Mac and Windows: set both input names (`PUT /api/config`),
  run with `AURORA_DEV_DUAL_CAPTURE=1`, record CPU and the `[dual-capture]`
  lines for each mode. Mac: watch whether Screen Recording and the audio
  prompt can both be granted (setup only asks for one today); Windows: WGC/DXGI
  plus miniaudio loopback (loopback gives zero callbacks with nothing
  playing, see input lessons).
- Then update [[node-graph-pipeline]] and close Aurora-o13; remove or keep the
  flag per what the graph work needs.
