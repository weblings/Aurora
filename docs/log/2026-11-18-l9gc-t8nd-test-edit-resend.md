# Test edits reach the lights and the demo room

Id: l9gc-t8nd-test-edit-resend

`Aurora-l9gc` (real app) and `Aurora-t8nd` (demo). Dragging a Tuning slider during Once or Live "Test on lights" changes the lights or room, and the 15 s countdown keeps running. The push-on-edit code was already in. This closes the beads on the owner's hand test and drops the "Edited since the test" label.

## State

- Re-send is `App.tsx` plus `useLightTest.push`: about 150 ms after an edit pauses, the draft is sent again. Overlapping edits fold into one more send. Failed or invalid sends are silent by design (the heartbeat reports a lost server).
- The label and the title menu note were redundant under auto re-send, so both are removed. The re-send effect never read the label's value. The top-bar browser check and its README follow.
- Owner confirmed both the demo and the real app by hand.

## Verification

- Demo: engine from CI run 44409842569 installed, editor rebuilt, `engine.test.mjs` 13/13, every `web/demo/*.test.mjs` and `seams.test.mjs` passed.
- App: `windows-app` Release build and `core-tests` built, ctest 516/516 serially.
- Label removal: editor typecheck clean and 299 vitest tests passed. The top-bar browser check was syntax-checked but not run.
- Not checked: whether the problems chip makes an invalid draft during a test obvious. A failed re-send is not retried until the next edit.

## Lessons

- Lessons: none.
