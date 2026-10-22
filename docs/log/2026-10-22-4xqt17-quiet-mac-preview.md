# Aurora-4xqt.17: preview on a quiet Mac says why it is empty

Id: 4xqt17-quiet-mac-preview

Follow-up to the start-up transient found in [[4xqt12-mac-gate-and-vscode]].

## Finding

- The bright start was the pre-[[4xqt13-optional-input-hold]] rule: a wired
  optional input that had never held a value fell to the param default, so
  `pulse` gave factor 1. The Mac gate ran at 12:12, before that change (12:38).
  With it in, the `both` preset at brightness 0 previews dark from the first
  colored frame with the tone playing (max 0.0, change 0).
- Probe of a fresh `MacAudioGrabber` read every 16 ms: with nothing playing it
  delivers no buffers at all; with audio already playing the first buffer comes
  in about 40 ms; after any sound it keeps delivering zero-filled buffers (no
  gap over 200 ms in 45 s). So there is no start-up second to wait out, and a
  wait-for-first-buffer would only add latency.
- On a quiet Mac the preview summary came back with no outputs and nothing said
  why.

## Changed

- `preview` adds a `note` when the summary has no outputs: no colors arrived,
  play something and preview again.
- Server instructions: an audio graph shows nothing until audio first arrives;
  after that, silence holds the last frame or settles at the quiet values.
- `dark_preview` in the Sequence D gate checks max brightness under 0.05 and
  `reacting` false again, instead of the min-brightness workaround.

## Verified

Mac, `mac-app`: ctest 113/113 (new case for the note), Sequence D gate 11/11
with the tightened dark step (brightness max 0.00, reacting False).

## Not done

The note does not check that the draft uses audio, so a video draft that sends
nothing gets the same text; it is worded to cover that.

The strict dark step (max brightness under 0.05 and `reacting` false, the check
the gate started with) has run on Mac only. The Linux and Windows passes in
[[4xqt13-optional-input-hold]] and [[4xqt15-scoped-agent-pairing]] used the
looser min-brightness version. The Linux log already saw `reacting` false after
the hold fix; neither platform has run the strict step since.
