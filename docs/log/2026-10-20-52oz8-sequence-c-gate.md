# Aurora-52oz.8: Sequence C gate on the fake-Hue stack (8/8 with the audio step on Windows, Mac and Linux)

Id: 52oz8-sequence-c-gate

C7 of [[sequence-c-planning]]. Script: `tools/light-viz-relay/sequence_c_gate.py`
(brings the stack up on the dummy input via `devstack.py`, tears it down after).

## Built

- Steps: draft + validate, preview beside live, test on lights, heartbeat loss
  revert, apply of a both-input graph, audio reaches the lights, app restart,
  gone output fallback.
- Run: `py tools/light-viz-relay/sequence_c_gate.py` (`python3` on Mac and
  Linux). Exit 0 only if every step passes. A box with no audio input skips the
  last four steps and fails unless `--allow-skip`.

## Verified

- Windows Release, rebuilt first (the old binary lacked the C4 and C5 routes):
  7/7 PASS in about 25 s. Revert came 6.0 s after the last heartbeat.
- Mac (arm64, `mac-app` preset rebuilt first, core suite 407/407): 7/7 PASS in
  about 13 s, no skips; the audio input came up as `mac-audio`, so the
  both-input steps ran. Revert came 6.4 s after the last heartbeat. Run with
  `--app build/mac-app/bin/Aurora.app/Contents/MacOS/Aurora` (the bundle path
  alone is not executable).
- Audio step (added after the runs above, so Windows's 7/7 predates it): the
  both-input graph wires `audio.features` rms into `frame.brightnessScale`
  (factor = 0.05 + 20 * rms). The script plays a looping 440 Hz tone (afplay,
  PowerShell SoundPlayer, or pw-play/paplay/aplay), waits for the lights to rise
  above 0.6, stops it, waits for them to fall under 0.2, twice. Mac: tone 1.00,
  quiet 0.03-0.04, twice, 8/8 PASS on two runs. Control with the tone never
  started: FAIL (the lights hold the last frame when no audio arrives, so they
  never fall). This closes the Mac half of the 52oz.2 recheck: audio data
  reaches a both-input graph and drives its output.
- Windows rerun with the audio step (`windows-audio` input, loopback capture):
  8/8 PASS in about 25 s. Tone 1.00, quiet 0.03, tone 1.00, quiet 0.04. The
  tone-never-started control was not run on Windows.
- Linux run with the audio step (`linux-audio` input, default-sink monitor
  via `pw-play`, 2026-10-21, rebuilt `build/linux-app`, `ctest` 136/136 and
  core 407/407 green beforehand): 8/8 PASS in about 13 s on two consecutive
  runs. Tone 1.00, quiet 0.03, tone 1.00, quiet 0.03, twice both times. Stack
  torn down afterwards, no listeners left on 8000/8215/18245/18443. This
  closes the Linux half of the 52oz.2 recheck alongside the Mac half above;
  the gate's acceptance criteria (script passes on all three OSes) are met.
- The both-input step's result text says "test on lights refused (needs a
  rebuild)". The refusal is intended (see Decisions), so the wording is stale.

## Decisions

- Restart relaunches without `--fresh` and with `AURORA_CONFIG_DIR` set to the
  fresh run's root, since `--fresh` would wipe it.
- Hue is the only registered output, so "remove an output" edits the stored
  graph to name an output the app does not have. Removing hue through
  `activeOutputNames` does not reach the fallback: the reload fails ("No
  outputs available") and the old pipeline keeps running. This is intended
  (`PipelineHost::reload` keeps the old pipeline on a failed build, with a
  `reload` host error). The fallback covers a custom effect that fails to
  load, and a built-in would hit the same missing outputs.
- Test on lights refuses the both-input graph (409 `cannot_test`), asserted as
  intended, so apply is the only way in.

- With no audio buffers the audio path sends nothing, so lights hold their last
  frame in silence; a tone check must watch for a change, never for a level alone.
  A single before/after reading passes with no tone because the dummy video
  drifts, so the step needs the on/off/on cycle.

## Lessons

- A pass on "applied, restarted, lit" does not show a signal reaches the output: filed in debugging-method (control run, on/off/on stimulus).
- Silent audio sends nothing, so lights hold their last frame: filed in input.
