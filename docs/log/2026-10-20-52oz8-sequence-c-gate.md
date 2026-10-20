# Aurora-52oz.8: Sequence C gate on the fake-Hue stack (Windows done, Mac and Linux open)

Id: 52oz8-sequence-c-gate

C7 of [[sequence-c-planning]]. Script: `tools/light-viz-relay/sequence_c_gate.py`
(brings the stack up on the dummy input via `devstack.py`, tears it down after).

## Built

- Steps: draft + validate, preview beside live, test on lights, heartbeat loss
  revert, apply of a both-input graph, app restart, gone output fallback.
- Run: `py tools/light-viz-relay/sequence_c_gate.py` (`python3` on Mac and
  Linux). Exit 0 only if every step passes. A box with no audio input skips the
  last three steps and fails unless `--allow-skip`.

## Verified

- Windows Release, rebuilt first (the old binary lacked the C4 and C5 routes):
  7/7 PASS in about 25 s. Revert came 6.0 s after the last heartbeat.
- Mac and Linux not run yet. The acceptance criteria stay open until they are.

## Decisions

- Restart relaunches without `--fresh` and with `AURORA_CONFIG_DIR` set to the
  fresh run's root, since `--fresh` would wipe it.
- Hue is the only registered output, so "remove an output" edits the stored
  graph to name an output the app does not have. Removing hue through
  `activeOutputNames` does not reach the fallback: the reload fails ("No
  outputs available") and the old pipeline keeps running.
- Test on lights refuses the both-input graph (409 `cannot_test`), asserted as
  intended, so apply is the only way in.

## Lessons

- none
