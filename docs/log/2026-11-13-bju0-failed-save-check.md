# Browser check failed-save: the audio graph ran because Aurora picks the missing input

Id: bju0-failed-save-check

`Aurora-bju0`. `graph-editor:failed-save` timed out at its [[f8yk-failed-apply-browser-check]] step: after a Save and apply with the draft swapped for `builtin.audio`, no shell row appeared.

Found: not a regression. Since Aurora-kep2.3 (2026-11-03, [[kep23-effect-id-picks-mode]]) a missing audio input is auto-picked on apply (`_pickAudioBackend`), so on this Mac `mac-audio` is chosen and opens. By hand: `POST /api/graph/apply` answered 200 with `effect: <id>`, no `reloadError`; `/api/state` had `errors: []`, `state: running`, `source.audio: {auto: true, input: "mac-audio"}`; `/api/config` gained `activeAudioInputName: "mac-audio"`; `app.log` had nothing. The binary matches the source (rebuilt 2026-11-13 08:57, no core/app change since 2026-11-11), so no rebuild. The step's premise ("the dummy input has no audio") only held where mac-audio failed to open (permission or device); it is environment-dependent, and what changed on this machine since the earlier pass could not be reconstructed.

Fix (check only): before the swap the check sets `activeAudioInputName` to a nonexistent name. Aurora auto-picks only an unnamed input, so the reload fails on every machine: apply 200 with `reloadError: "Couldn't start <id>: Unknown audio input 'no-such-audio-input'"`, state `failed`, error `source: effect`, `retry: true`. The check clears the name before the working-graph step (while it is set every reload reports it, so the row would not clear) and again in `finally`. README entry updated.

## Verification
- `graph-editor:failed-save` fails before the fix (frame wait at the row) and passes after (13 s).
- Regression set run once at the end: see the bead report.

## Lessons
- `docs/lessons/web-testing.md`: a check that needs a missing input must name a broken one, not rely on none being configured.
