# Aurora-o13: video and audio capture at the same time (Linux, Mac, Windows capture run)

Id: o13-dual-capture

2026-10-11. Spike for node prep 9: can one `Pipeline` run screen and audio
capture together on each platform? Linux works. Mac capture works under the
terminal's grants (2026-10-12). Windows works (2026-10-12); video `update()` is over the tick budget there.

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

**Permission matrix: dropped (owner decision, 2026-10-12).** One attempt was
made: reset `ScreenCapture`, `AudioCapture` (and, by mistake,
`SystemPolicyAllFiles`) for `com.aurora.app`, relaunched `Aurora.app` via
`open` with both inputs. The PUT returned in 2 s and `/api/state` went
`failed` with `permission_denied` (expected first-request result). Not
pursued: prompt order and grant order do not matter for this question, and
Aurora-h457 already found Screen Recording alone covers the audio tap. The
Mac result above is the same shape as Linux's (live stack, live capture).
Side effect: those three grants for `com.aurora.app` are reset, so the
installed app asks again on its next launch.

## Windows result (2026-10-12): works; video update is over budget

Windows 11, `windows-app` Release rebuilt at d4d7abd (the exe on disk predated
the spike). Run through `devstack.py up` with the flag exported: `windows`
(DXGI) + `windows-audio` (miniaudio loopback), a looping 440 Hz WAV playing via
`SoundPlayer` throughout. 60 Hz (16.67 ms budget). Process CPU from
`GetProcessTimes` over 30 s after an 8 s settle; modes switched live by
`PUT /api/config`. Four passes of video, three of the others (the first
pass had no timings). `[dual-capture]` lines read from the app's own console
(`AURORA_CONSOLE=1`, buffer read by pid) since devstack gives the exe no
console.

| Mode | CPU (one core), passes | `update()` avg / max ms (steady windows) |
|---|---|---|
| Video only | 36.6, 31.2, 43.3, 33.8% | video 31.6-32.1 / 50-52 |
| Audio only | 0.5, 0.4, 0.6% | audio 0.15 / 0.4-0.8 |
| Both | 30.5, 33.9, 38.7% | video 31.2-31.8 / 50-51; audio 0.10-0.11 / 0.2-0.3 |

- No capture conflict: DXGI and loopback ran together, switched live with no
  relaunch.
- Video `update()` does not move with audio added (about 31.5 ms either way);
  audio `update()` is cheaper in dual, as on Mac.
- CPU additivity is not resolvable: video-only alone spans 31-43% across
  passes (mean 36), larger than the ~0.5% audio cost, and both (mean 34) falls
  inside it. Linux and Mac were additive but their audio costs were 3.5-4%.
- Audio is ~0.5% CPU, 7x below Linux/Mac (3.5-4%). Frames flow (below), so
  loopback is delivering; the cause is not chased.
- **Video `update()` averages ~32 ms against a 16.67 ms budget** (Linux 7.3,
  Mac 4.1), in video-only too, so it is not a dual cost. The window still
  reports 300 ticks per 5 s, which 32 ms updates cannot produce; the timer
  and the tick count disagree and this was not chased. Matters for the
  graph's per-tick budget on Windows.
- Startup outliers: video max 667-1090 ms in the first window after each
  switch to a video mode (rebuild), never in steady state.
- Light frames per 5 s on the relay SSE: audio+tone 161, video 158, both 313.
  Same interleave as Linux and Mac (the output has two writers).
- Audio-only with nothing playing gave zero frames (SSE read timed out), as
  the loopback lesson predicts.

## Which output wins: neither

Both orchestrators call `output->send()` each tick, and `HueOutput::send()`
streams every call (no latest-wins buffer). The light tap showed 47 frames/s
with both vs 23 with one source, with 27 video/audio switches per second:
the lights flicker between the two. A graph needs one sink per output that
picks or mixes before `send()`; two sources must never share an output
directly. Lesson in architecture-process.

## Resume

- Windows: why video `update()` is ~32 ms against a 16.67 ms budget while
  ticks still report 300 per 5 s (timer or tick-count bug?) is open.
- Close Aurora-o13; remove or keep the flag per what the graph work needs.
